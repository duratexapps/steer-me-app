import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { EventCard } from '@/src/components/EventCard';
import { EventFiltersBar } from '@/src/components/EventFiltersBar';
import { ReportModal } from '@/src/components/ReportModal';
import { RatingModal } from '@/src/components/RatingModal';
import { colors } from '@/src/theme/theme';
import { useSessionStore } from '@/src/state/session-store';
import {
  usePublishedEvents,
  useAttendanceCounts,
  useMyAttendance,
  useToggleAttendance,
  useRatingSummaries,
  type EventWithProducer,
} from '@/src/hooks/useEvents';
import { useSubmitEventReport, EVENT_REPORT_OFFENSES } from '@/src/hooks/useReporting';
import { useMyRatedEventIds, useSubmitRating } from '@/src/hooks/useRatings';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';
import { useResponsiveColumns } from '@/src/hooks/useResponsiveColumns';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useTownDistances } from '@/src/hooks/useTownDistances';
import {
  applyEventFilters,
  distinctStates,
  filtersFromParams,
  filtersToParams,
  type EventFilters,
} from '@/src/lib/event-filters';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';

// Mirrors Screen 11 (#events) - athlete-facing browse, attend toggle, and
// the "Partners" jump into event-partners.tsx, pre-filtered to this
// event+division. That's a normal pushed route (not a tab), specifically
// so it gets real back-stack history - see event-partners.tsx's header
// comment for the bug this replaced.
export default function Events() {
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: profile } = useMyProfile();
  const { data: events, isLoading: eventsLoading } = usePublishedEvents();

  // Filters and the "which card to scroll back to" marker both live in the
  // URL's query params, not just local state - real gap reported by the
  // user (2026-09-18): tapping "Partners" on an event, then hitting back,
  // used to remount this screen from scratch, wiping filters and scroll
  // position and forcing a re-search for whatever event they'd found.
  // Reading the initial values here and writing them back via
  // router.setParams() (below) means the browser/router's own back
  // navigation restores this screen exactly as it was, for free - no
  // separate persistence layer, since going back returns to the same URL.
  const params = useLocalSearchParams<{
    showPast?: string;
    state?: string;
    dateWindow?: string;
    maxMiles?: string;
    focusEventId?: string;
  }>();
  const focusEventId = params.focusEventId;

  // Distances are computed from EVERY fetched event's location, regardless
  // of the current filter selection - so flipping the distance pill (or any
  // other filter) never has to wait on a fresh network round trip, it's
  // just re-filtering data already sitting in memory.
  const distances = useTownDistances(profile?.home_area, (events ?? []).map((e) => e.location));
  const [filters, setFilters] = useState<EventFilters>(() => filtersFromParams(params));
  // Keep the URL in sync as filters change, so it's always accurate if the
  // user navigates away and back. Skips the very first run deliberately -
  // real bug hit live: calling router.setParams() during this screen's
  // initial mount (before Expo Router's own navigator has finished its
  // first rehydration from the URL) threw deep inside StackRouter's
  // getRehydratedState, crashing the whole app. The filters are already
  // correct from the URL at mount (see the lazy useState initializer
  // above) - there's nothing to sync back on that first render anyway,
  // only on a genuine later change from the filter bar.
  const isFirstFiltersEffect = useRef(true);
  useEffect(() => {
    if (isFirstFiltersEffect.current) {
      isFirstFiltersEffect.current = false;
      return;
    }
    router.setParams(filtersToParams(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // PERF, 2026-08-16: both scan the full events array - memoized so an
  // unrelated re-render (toggling attendance, opening the report modal,
  // submitting a rating) doesn't re-run a full-array pass every time,
  // only when the events/filters/distances actually changed.
  const filteredEvents = useMemo(
    () => applyEventFilters(events ?? [], filters, distances),
    [events, filters, distances]
  );
  const states = useMemo(() => distinctStates(events ?? []), [events]);

  const listRef = useRef<FlatList>(null);
  const hasScrolledToFocus = useRef(false);
  useEffect(() => {
    if (!focusEventId || hasScrolledToFocus.current || filteredEvents.length === 0) return;
    const index = filteredEvents.findIndex((e) => e.id === focusEventId);
    if (index === -1) return;
    hasScrolledToFocus.current = true;
    // Slight delay - the list needs a layout pass before scrollToIndex can
    // measure anything to scroll to, especially right after navigating
    // back in (same reasoning as the onScrollToIndexFailed fallback below).
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 }), 50);
    router.setParams({ focusEventId: '' });
  }, [focusEventId, filteredEvents]);

  const eventIds = filteredEvents.map((e) => e.id);
  const { data: counts } = useAttendanceCounts(eventIds);
  const { data: myAttendance } = useMyAttendance(eventIds, userId);
  const { data: ratingSummaries } = useRatingSummaries(eventIds);
  const { data: ratedEventIds } = useMyRatedEventIds();
  const toggleAttendance = useToggleAttendance();
  const submitReport = useSubmitEventReport();
  const submitRating = useSubmitRating();
  const requireSubscription = useRequireSubscription();
  const numColumns = useResponsiveColumns();

  const [reportTarget, setReportTarget] = useState<EventWithProducer | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<EventWithProducer | null>(null);

  async function handleToggle(event: EventWithProducer, division: number) {
    const key = `${event.id}:${division}`;
    const attending = myAttendance?.has(key) ?? false;
    if (!attending && !requireSubscription()) return;
    try {
      await toggleAttendance.mutateAsync({ eventId: event.id, division, attending });
      showToast(attending ? 'Removed from attending' : `Marked attending - ${division} division`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update attendance');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Events" subtitle="Posted by real producers - mark your plans to attend" onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      {/* PERF, 2026-08-27: was a ScrollView + .map() over the full filtered
          list - every card (and every full-resolution flier image inside
          it) mounted at once regardless of scroll position, no windowing
          at all. FlatList only renders what's near the viewport, same
          numColumns/columnWrapperStyle/key pattern browse.tsx already
          uses (numColumns can't change without a remount, hence the key). */}
      <FlatList
        ref={listRef}
        key={numColumns}
        contentContainerStyle={styles.content}
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        // scrollToIndex can fail if the target hasn't been measured yet
        // (e.g. right after navigating back in, before layout settles) -
        // this is the standard FlatList fallback, retrying once layout
        // catches up rather than silently doing nothing.
        onScrollToIndexFailed={(info) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.3 }), 100);
        }}
        ListHeaderComponent={
          events && events.length > 0 ? (
            <EventFiltersBar
              filters={filters}
              onChange={setFilters}
              states={states}
              homeArea={profile?.home_area}
              resultCount={filteredEvents.length}
            />
          ) : null
        }
        renderItem={({ item: event }) => (
          <View style={numColumns > 1 ? styles.gridItem : undefined}>
            <EventCard
              event={event}
              counts={counts}
              myAttendance={myAttendance}
              alreadyRated={ratedEventIds?.has(event.id)}
              ratingSummary={ratingSummaries?.get(event.id)}
              onToggleAttend={(division) => handleToggle(event, division)}
              onShowPartners={(division) => {
                // Passes this event's id + the CURRENT filters along as
                // return-trip params, rather than writing them onto this
                // screen's own history entry before pushing. Real bug hit
                // live: router.setParams() followed by router.push() in
                // the same interaction - even deferred a tick - crashed
                // deep inside Expo Router's web rehydration (StackRouter's
                // getRehydratedState), regardless of timing. setParams
                // alone (from the filter bar, above) is fine; it's
                // specifically pairing it with a navigation that broke.
                // event-partners.tsx's own back button uses these to
                // reconstruct the exact return URL with one plain
                // replace() instead - see its header comment.
                router.push({
                  pathname: '/event-partners',
                  params: {
                    eventId: event.id,
                    division: String(division),
                    eventName: event.name,
                    focusEventId: event.id,
                    ...filtersToParams(filters),
                  },
                });
              }}
              onReport={() => setReportTarget(event)}
              onRatePress={() => setRatingTarget(event)}
            />
          </View>
        )}
        ListEmptyComponent={
          eventsLoading ? (
            <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
          ) : !events || events.length === 0 ? (
            <DividerNote>No events posted yet.</DividerNote>
          ) : (
            <DividerNote>No events match these filters - try widening your search.</DividerNote>
          )
        }
      />

      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          targetName={reportTarget.name}
          contentRef={`Event listing — ${reportTarget.name}`}
          offenses={EVENT_REPORT_OFFENSES}
          submitting={submitReport.isPending}
          onSubmit={(offense, description) => submitReport.mutateAsync({ eventId: reportTarget.id, offense, description })}
        />
      ) : null}

      {ratingTarget ? (
        <RatingModal
          visible
          onClose={() => setRatingTarget(null)}
          submitting={submitRating.isPending}
          onSubmit={async (stars, review) => {
            try {
              await submitRating.mutateAsync({ eventId: ratingTarget.id, stars, review });
              showToast(`Rated ${ratingTarget.name} — ${stars}★`);
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Could not submit rating');
            }
          }}
        />
      ) : null}
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="events" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  columnWrapper: { gap: 14 },
  gridItem: { flex: 1 },
});
