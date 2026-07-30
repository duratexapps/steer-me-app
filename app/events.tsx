import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
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
import { useResponsiveColumns, gridItemWidthPercent } from '@/src/hooks/useResponsiveColumns';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useTownDistances } from '@/src/hooks/useTownDistances';
import { applyEventFilters, distinctStates, DEFAULT_EVENT_FILTERS, type EventFilters } from '@/src/lib/event-filters';
import { showToast } from '@/src/state/toast-store';

// Mirrors Screen 11 (#events) - athlete-facing browse, attend toggle, and
// the "Partners" jump into Browse pre-filtered to this event+division
// (Browse reads the eventId/division query params it's pushed with here).
export default function Events() {
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: profile } = useMyProfile();
  const { data: events, isLoading: eventsLoading } = usePublishedEvents();

  // Distances are computed from EVERY fetched event's location, regardless
  // of the current filter selection - so flipping the distance pill (or any
  // other filter) never has to wait on a fresh network round trip, it's
  // just re-filtering data already sitting in memory.
  const distances = useTownDistances(profile?.home_area, (events ?? []).map((e) => e.location));
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_EVENT_FILTERS);
  const filteredEvents = applyEventFilters(events ?? [], filters, distances);
  const states = distinctStates(events ?? []);

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
  const itemWidth = gridItemWidthPercent(numColumns);

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
      <ScreenHeader title="Events" subtitle="Posted by real producers - mark your plans to attend" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {eventsLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
        ) : !events || events.length === 0 ? (
          <DividerNote>No events posted yet.</DividerNote>
        ) : (
          <>
            <EventFiltersBar
              filters={filters}
              onChange={setFilters}
              states={states}
              homeArea={profile?.home_area}
              resultCount={filteredEvents.length}
            />
            {filteredEvents.length === 0 ? (
              <DividerNote>No events match these filters - try widening your search.</DividerNote>
            ) : (
              <View style={styles.grid}>
                {filteredEvents.map((event) => (
                  <View key={event.id} style={{ width: itemWidth }}>
                    <EventCard
                      event={event}
                      counts={counts}
                      myAttendance={myAttendance}
                      alreadyRated={ratedEventIds?.has(event.id)}
                      ratingSummary={ratingSummaries?.get(event.id)}
                      onToggleAttend={(division) => handleToggle(event, division)}
                      onShowPartners={(division) =>
                        router.push({ pathname: '/(tabs)/browse', params: { eventId: event.id, division: String(division), eventName: event.name } })
                      }
                      onReport={() => setReportTarget(event)}
                      onRatePress={() => setRatingTarget(event)}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
