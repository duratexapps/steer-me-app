import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PartnerCard } from '@/src/components/PartnerCard';
import { ReportModal } from '@/src/components/ReportModal';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { type PublicProfile } from '@/src/hooks/useEligiblePartners';
import { useEventPartners } from '@/src/hooks/useEvents';
import { useSentRequests, useSendRequest } from '@/src/hooks/usePartnerRequests';
import { useBlockUser } from '@/src/hooks/useBlocking';
import { useFavorites, useToggleFavorite } from '@/src/hooks/useFavorites';
import { useSubmitUserReport, USER_REPORT_OFFENSES } from '@/src/hooks/useReporting';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';
import { useResponsiveColumns } from '@/src/hooks/useResponsiveColumns';
import { formatDivision } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

// Split out of browse.tsx (2026-09-18) - real bug reported by the user:
// Events' "Partners" button used to push into `/(tabs)/browse`, a bottom-
// tab ROOT screen. Tab roots don't get a normal poppable stack frame the
// way a plain pushed route does, so there was nothing for the phone's
// back gesture to return to - it fell straight through the whole stack to
// the main menu instead of back to the event list. This screen is a
// normal top-level route (same pattern as events.tsx/my-entries.tsx),
// which gets real back-stack history.
//
// The back button deliberately does its own router.replace() with the
// filters/focusEventId events.tsx handed it, rather than a plain
// goBackOrHome(). Real bug hit live: events.tsx originally tried to mark
// its OWN history entry with router.setParams() right before pushing here
// - that combination (setParams immediately followed by a navigation),
// even deferred a tick, crashed deep in Expo Router's web rehydration
// (StackRouter's getRehydratedState) regardless of timing. Reconstructing
// the return URL here instead, as a single plain replace(), sidesteps
// that combination entirely while still landing back on /events with
// filters and scroll position intact.
export default function EventPartners() {
  const { eventId, division: divisionParam, eventName, focusEventId, showPast, state, dateWindow, maxMiles } =
    useLocalSearchParams<{
      eventId: string;
      division: string;
      eventName: string;
      focusEventId?: string;
      showPast?: string;
      state?: string;
      dateWindow?: string;
      maxMiles?: string;
    }>();
  const eventDivision = parseFloat(divisionParam);

  function handleBack() {
    router.replace({ pathname: '/events', params: { focusEventId, showPast, state, dateWindow, maxMiles } });
  }

  const { data: me } = useMyProfile();
  const requireSubscription = useRequireSubscription();
  const numColumns = useResponsiveColumns();
  const [helpOpen, setHelpOpen] = useState(false);

  const { data: partners, isLoading } = useEventPartners(eventId, eventDivision, me?.position ?? 'Header');

  const { data: sentRequests } = useSentRequests();
  const sendRequest = useSendRequest();
  const blockUser = useBlockUser();
  const submitReport = useSubmitUserReport();
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);

  const requestedIds = useMemo(() => new Set((sentRequests ?? []).map((r) => r.recipient_id)), [sentRequests]);
  const favoriteIds = useMemo(() => new Set((favorites ?? []).map((f) => f.id)), [favorites]);

  async function handleRequest(partner: PublicProfile) {
    if (!requireSubscription()) return;
    try {
      await sendRequest.mutateAsync({ recipientId: partner.id, division: eventDivision, eventId });
      showToast(
        partner.is_minor ? `Request routed to ${partner.full_name}'s guardian for approval` : `Request sent to ${partner.full_name}`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send request');
    }
  }

  if (!me) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Eligible Partners"
        subtitle="Showing ropers you can legally partner with"
        onBack={handleBack}
        onHelp={() => setHelpOpen(true)}
      />
      <FlatList
        key={numColumns}
        contentContainerStyle={styles.content}
        data={partners ?? []}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        ListHeaderComponent={
          <View style={styles.eventBanner}>
            <Text style={styles.eventBannerText}>
              Showing partners attending <Text style={{ fontFamily: fonts.bodyBold }}>{eventName}</Text> (
              {formatDivision(eventDivision)} division) who are also marked attending.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={numColumns > 1 ? styles.gridItem : undefined}>
            <PartnerCard
              partner={item}
              alreadyRequested={requestedIds.has(item.id)}
              nearby={false}
              isFavorite={favoriteIds.has(item.id)}
              onToggleFavorite={() => toggleFavorite.mutate({ favoriteId: item.id, isFavorite: favoriteIds.has(item.id) })}
              onRequest={() => handleRequest(item)}
              onReport={() => setReportTarget(item)}
              onBlock={() => blockUser.mutate(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
          ) : (
            <DividerNote>No one else has marked attending for this division yet. Check back closer to the event.</DividerNote>
          )
        }
      />

      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          targetName={reportTarget.full_name}
          contentRef={`Profile card — ${reportTarget.full_name}, ${reportTarget.position}, ${reportTarget.home_area}`}
          offenses={USER_REPORT_OFFENSES}
          submitting={submitReport.isPending}
          onSubmit={(offense, description) =>
            submitReport.mutateAsync({
              targetUserId: reportTarget.id,
              offense,
              description,
              contentRef: `Profile card — ${reportTarget.full_name}, ${reportTarget.position}, ${reportTarget.home_area}`,
            })
          }
        />
      ) : null}
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="browse" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  columnWrapper: { gap: 14 },
  gridItem: { flex: 1 },
  eventBanner: {
    backgroundColor: colors.espresso,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
  },
  eventBannerText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.bone, lineHeight: 17 },
});
