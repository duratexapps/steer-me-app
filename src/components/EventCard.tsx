import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDivision } from '@/src/lib/matching';
import { formatDateDisplay } from '@/src/lib/date';
import { publicUrlFor } from '@/src/lib/storage-upload';
import type { EventWithProducer, RatingSummary } from '@/src/hooks/useEvents';

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

  const isPast = new Date(event.event_date) < new Date();
  const attendedAnyDivision = event.divisions.some((d) => myAttendance?.has(`${event.id}:${d}`));
  const canRate = !producerView && isPast && attendedAnyDivision && !alreadyRated;
  const flierUrl = publicUrlFor('event-fliers', event.flier_path);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{event.name}</Text>
      <Text style={styles.producerLine}>
        {event.producer_org_name} · {formatDateDisplay(event.event_date)}
      </Text>
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
