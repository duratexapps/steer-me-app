import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { EventCard } from '@/src/components/EventCard';
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
import { showToast } from '@/src/state/toast-store';

// Mirrors Screen 11 (#events) - athlete-facing browse, attend toggle, and
// the "Partners" jump into Browse pre-filtered to this event+division
// (Browse reads the eventId/division query params it's pushed with here).
export default function Events() {
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: events, isLoading: eventsLoading } = usePublishedEvents();
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: counts } = useAttendanceCounts(eventIds);
  const { data: myAttendance } = useMyAttendance(eventIds, userId);
  const { data: ratingSummaries } = useRatingSummaries(eventIds);
  const { data: ratedEventIds } = useMyRatedEventIds();
  const toggleAttendance = useToggleAttendance();
  const submitReport = useSubmitEventReport();
  const submitRating = useSubmitRating();
  const requireSubscription = useRequireSubscription();

  const [reportTarget, setReportTarget] = useState<EventWithProducer | null>(null);
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
      <ScreenHeader title="Events" subtitle="Posted by real producers - mark your plans to attend" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {eventsLoading ? (
          <ActivityIndicator color={colors.rust} style={{ marginTop: 20 }} />
        ) : !events || events.length === 0 ? (
          <DividerNote>No events posted yet.</DividerNote>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
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
          ))
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
});
