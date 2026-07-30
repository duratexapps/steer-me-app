import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDivision } from '@/src/lib/matching';
import { formatDateRangeDisplay, isEventStillUpcoming } from '@/src/lib/date';
import { publicUrlFor } from '@/src/lib/storage-upload';
import type { EventWithProducer, RatingSummary } from '@/src/hooks/useEvents';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useCreateEntryHandoff, withHandoffParam } from '@/src/hooks/useEntryHandoff';

const RATING_MIN_TO_SHOW = 3;

type EventCardProps = {
  event: EventWithProducer;
  counts: Map<string, number> | undefined;
  producerView?: boolean;
  myAttendance?: Set<string>;
  alreadyRated?: boolean;
  ratingSummary?: RatingSummary;
  onToggleAttend?: (division: number) => void;
  onShowPartners?: (division: number) => void;
  onReport?: () => void;
  onRatePress?: () => void;
};

// Mirrors buildEventCard() from the prototype - shared between the producer
// dashboard (counts only) and athlete-facing Events (attend toggle +
// Partners button + rating badge + report link).
export function EventCard({
  event,
  counts,
  producerView,
  myAttendance,
  alreadyRated,
  ratingSummary,
  onToggleAttend,
  onShowPartners,
  onReport,
  onRatePress,
}: EventCardProps) {
  const ratingText =
    ratingSummary && ratingSummary.rating_count >= RATING_MIN_TO_SHOW
      ? `★ ${ratingSummary.avg_stars?.toFixed(1)} (${ratingSummary.rating_count} rating${ratingSummary.rating_count === 1 ? '' : 's'})`
      : 'Not enough ratings yet';

  // FIXED live 2026-07-29 alongside migration 0039 (multi-day events) -
  // this used to compare event_date alone, which would call a week-long
  // roping "past" the moment its first day ended, even while it was
  // still actively running.
  const isPast = !isEventStillUpcoming(event.event_date, event.event_end_date);
  const attendedAnyDivision = event.divisions.some((d) => myAttendance?.has(`${event.id}:${d}`));
  const canRate = !producerView && isPast && attendedAnyDivision && !alreadyRated;
  const flierUrl = publicUrlFor('event-fliers', event.flier_path);

  // NEW, added 2026-07-28 - real friction gap flagged directly by the
  // user: a Steer Me user tapping "Enter the Draw" had to retype their
  // own info from scratch on Draw Pro's entry page, even though it's
  // already sitting right here. Creates a short-lived, single-use handoff
  // (see migration 0036_entry_handoffs.sql for why this isn't just stuffed
  // into the URL as query params) carrying just MY OWN info - no partner
  // data, since a plain "Enter the Draw" tap (as opposed to the
  // "Enter with partner" action on an accepted request - see
  // my-requests.tsx) has no confirmed partner to include. Silently falls
  // back to the plain, un-prefilled link if this fails for any reason -
  // a failed prefill should never block someone from entering at all.
  const { data: me } = useMyProfile();
  const createHandoff = useCreateEntryHandoff();

  async function handleEnterDraw() {
    const url = event.draw_pro_entry_url!;
    if (!me) {
      Linking.openURL(url);
      return;
    }
    try {
      const handoffId = await createHandoff.mutateAsync({ eventId: event.id });
      Linking.openURL(withHandoffParam(url, handoffId));
    } catch (err) {
      console.warn('[EventCard] entry handoff failed, falling back to plain link', err);
      Linking.openURL(url);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{event.name}</Text>
      <Text style={styles.producerLine}>
        {event.producer_org_name ?? 'Posted via Draw Pro'} · {formatDateRangeDisplay(event.event_date, event.event_end_date)}
      </Text>
      {/* NEW, added 2026-07-29 - TEMPORARY cold-start bootstrap feature
          (migration 0038) - per direct instruction: "should show the
          producer name & info but clarify that it is an admin post."
          The real producer's name already shows above via
          producer_org_name (same external_producer_name fallback
          Draw-Pro-synced events use) - this is just the clarifier. */}
      {event.posted_by_admin ? (
        <Text style={styles.adminPostedLine}>Posted by RopingTools on this producer's behalf</Text>
      ) : null}
      <Text style={styles.meta}>
        {event.location} · {event.entry_fee ?? 'See listing'}
      </Text>
      {!producerView ? (
        <Text style={[styles.rating, ratingSummary && ratingSummary.rating_count >= RATING_MIN_TO_SHOW ? styles.ratingActive : styles.ratingMuted]}>
          {ratingText}
        </Text>
      ) : null}
      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
      {flierUrl ? <Image source={{ uri: flierUrl }} style={styles.flier} contentFit="cover" /> : null}

      <View style={styles.divisionRow}>
        {event.divisions.map((d) => {
          const key = `${event.id}:${d}`;
          const count = counts?.get(key) ?? 0;
          const attending = myAttendance?.has(key) ?? false;
          return (
            <View key={d} style={styles.divisionPill}>
              {!producerView ? (
                <Pressable onPress={() => onToggleAttend?.(d)} style={[styles.attendCheck, attending && styles.attendCheckOn]}>
                  {attending ? <Ionicons name="checkmark" size={11} color={colors.bone} /> : null}
                </Pressable>
              ) : null}
              <Text style={styles.divisionText}>
                {formatDivision(d)} <Text style={styles.divisionCount}>{count} attending</Text>
              </Text>
              {!producerView ? (
                <Pressable onPress={() => onShowPartners?.(d)} style={styles.partnersBtn}>
                  <Text style={styles.partnersBtnText}>Partners</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* One shared entry link per event (not per division) - Draw Pro's
          own entry page is where the entrant actually picks which class,
          same as the QR code that's generated there. Independent of
          finding a partner first - a solo/draw-in entrant needs this same
          path in, not just someone who already lined up a partner via
          the per-division "Partners" button above. */}
      {!producerView && event.draw_pro_entry_url ? (
        <Pressable style={styles.enterDrawBtn} onPress={handleEnterDraw}>
          <Ionicons name="open-outline" size={14} color={colors.bone} />
          <Text style={styles.enterDrawBtnText}>Enter the Draw</Text>
        </Pressable>
      ) : null}

      {canRate ? (
        <View style={styles.ratePrompt}>
          <Text style={styles.ratePromptText}>You marked attending - how was it?</Text>
          <Pressable onPress={onRatePress} style={styles.partnersBtn}>
            <Text style={styles.partnersBtnText}>Rate this event</Text>
          </Pressable>
        </View>
      ) : null}

      {!producerView && onReport ? (
        <Pressable onPress={onReport} style={{ marginTop: 8, cursor: 'pointer' }}>
          <Text style={styles.reportLink}>Report this event</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 14,
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  producerLine: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.brass, marginTop: 1 },
  adminPostedLine: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 10.5,
    color: colors.saddle,
    marginTop: 1,
  },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginTop: 4, lineHeight: 16 },
  rating: { fontSize: 12.5, fontFamily: fonts.bodyBold, marginTop: 6 },
  ratingActive: { color: colors.brass },
  ratingMuted: { color: colors.saddle },
  description: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, marginTop: 8, lineHeight: 17 },
  flier: { width: '100%', height: 160, borderRadius: radii.md, marginTop: 10 },
  divisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  divisionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 6,
    backgroundColor: colors.bone,
  },
  attendCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.saddle,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  attendCheckOn: { backgroundColor: colors.green, borderColor: colors.green },
  divisionText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.espresso },
  divisionCount: { fontSize: 10, color: colors.brass, fontFamily: fonts.bodyBold },
  partnersBtn: { backgroundColor: colors.espresso, borderRadius: radii.sm, paddingVertical: 4, paddingHorizontal: 8, cursor: 'pointer' },
  partnersBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: colors.bone },
  reportLink: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, textDecorationLine: 'underline' },
  enterDrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brass,
    borderRadius: radii.sm,
    paddingVertical: 9,
    marginTop: 10,
    cursor: 'pointer',
  },
  enterDrawBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.bone },
  ratePrompt: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  ratePromptText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.espresso, flexShrink: 1 },
});
