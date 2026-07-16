import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { Pill } from '@/src/components/ui/Pill';
import { PartnerCard } from '@/src/components/PartnerCard';
import { ReportModal } from '@/src/components/ReportModal';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useEligiblePartners, type PublicProfile } from '@/src/hooks/useEligiblePartners';
import { useEventPartners } from '@/src/hooks/useEvents';
import { useSentRequests, useSendRequest } from '@/src/hooks/usePartnerRequests';
import { useBlockUser } from '@/src/hooks/useBlocking';
import { useSubmitUserReport, USER_REPORT_OFFENSES } from '@/src/hooks/useReporting';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';
import { formatDivision, DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { getCurrentCity } from '@/src/lib/location';
import { showToast } from '@/src/state/toast-store';

// Mirrors Screen 4 (#browse). The "my groups only" toggle from the
// prototype is omitted - Groups is a deferred feature. Location uses real
// expo-location + reverse geocoding instead of the prototype's fake timer.
// When pushed from Events' "Partners" button (eventId/division params),
// this switches to event-scoped matching instead of the raw cap filter.
// Goat Roping discovery no longer lives here - it moved to the Post tab's
// need_posts listings, which carry the event details (date/producer/flier)
// that a plain cap-based browse never had.
export default function Browse() {
  const { cap: capParam, eventId, division: divisionParam, eventName } = useLocalSearchParams<{
    cap?: string;
    eventId?: string;
    division?: string;
    eventName?: string;
  }>();
  const eventDivision = divisionParam ? parseFloat(divisionParam) : null;
  const inEventContext = !!eventId && eventDivision !== null;

  const { data: me } = useMyProfile();
  const requireSubscription = useRequireSubscription();
  // Post a Need used to drive this via the cap param; now that Post is its
  // own browsable feed, Browse needs its own picker so there's still a way
  // to change which cap you're browsing eligible partners for.
  const [cap, setCap] = useState(capParam ? parseFloat(capParam) : 10.5);
  const [useLocationOn, setUseLocationOn] = useState(false);
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const capResult = useEligiblePartners(cap, useLocationOn ? currentCity : null);
  const eventResult = useEventPartners(eventId ?? '', eventDivision ?? 0, me?.position ?? 'Header');
  const { data: partners, isLoading } = inEventContext ? eventResult : capResult;

  const { data: sentRequests } = useSentRequests();
  const sendRequest = useSendRequest();
  const blockUser = useBlockUser();
  const submitReport = useSubmitUserReport();

  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);

  const requestedIds = useMemo(() => new Set((sentRequests ?? []).map((r) => r.recipient_id)), [sentRequests]);

  async function toggleLocation() {
    if (useLocationOn) {
      setUseLocationOn(false);
      setCurrentCity(null);
      return;
    }
    setLocationLoading(true);
    const city = await getCurrentCity();
    setLocationLoading(false);
    if (city) {
      setUseLocationOn(true);
      setCurrentCity(city);
      showToast(`Showing partners near ${city}`);
    }
  }

  async function handleRequest(partner: PublicProfile) {
    if (!requireSubscription()) return;
    try {
      await sendRequest.mutateAsync({
        recipientId: partner.id,
        division: inEventContext ? eventDivision! : cap,
        eventId: inEventContext ? eventId : undefined,
      });
      showToast(
        partner.is_minor ? `Request routed to ${partner.full_name}'s guardian for approval` : `Request sent to ${partner.full_name}`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send request');
    }
  }

  if (!me) return null;

  const areaLabel = useLocationOn && currentCity ? `near ${currentCity} (current location)` : `near your home area (${me.home_area})`;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Eligible Partners" subtitle="Showing ropers you can legally partner with" />
      <FlatList
        contentContainerStyle={styles.content}
        data={partners ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {inEventContext ? (
              <View style={styles.eventBanner}>
                <Text style={styles.eventBannerText}>
                  Showing partners attending{' '}
                  <Text style={{ fontFamily: fonts.bodyBold }}>{eventName}</Text> ({formatDivision(eventDivision)} division) who
                  are also marked attending.
                </Text>
                <Pressable onPress={() => router.replace('/(tabs)/browse')}>
                  <Text style={styles.clearLink}>Clear and browse everyone eligible</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.eyebrow}>Choose your event cap</Text>
                <View style={styles.pillWrap}>
                  {DIVISION_OPTIONS.map((c) => (
                    <Pill key={c} label={c === OPEN_CAP ? 'Open' : `#${c}`} selected={cap === c} onPress={() => setCap(c)} />
                  ))}
                </View>
                <ToggleRow
                  title="Use my current location"
                  description="Traveling? Find partners near where you are, not just home"
                  value={useLocationOn}
                  onToggle={toggleLocation}
                />
                <Text style={styles.sub}>
                  {locationLoading
                    ? 'Requesting location access...'
                    : `Eligible partners for a ${formatDivision(cap)} roping, ${areaLabel}`}
                </Text>
              </>
            )}
          </>
        }
        renderItem={({ item }) => (
          <PartnerCard
            partner={item}
            alreadyRequested={requestedIds.has(item.id)}
            nearby={useLocationOn && item.home_area === currentCity}
            onRequest={() => handleRequest(item)}
            onReport={() => setReportTarget(item)}
            onBlock={() => blockUser.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.brass} style={{ marginTop: 20 }} />
          ) : (
            <DividerNote>
              {inEventContext
                ? 'No one else has marked attending for this division yet. Check back closer to the event.'
                : 'No eligible partners posted right now. Try turning off a filter or widening your event.'}
            </DividerNote>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 8,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 14 },
  eventBanner: {
    backgroundColor: colors.espresso,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
  },
  eventBannerText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.bone, lineHeight: 17 },
  clearLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.saddle,
    textDecorationLine: 'underline',
    marginTop: 8,
  },
});
