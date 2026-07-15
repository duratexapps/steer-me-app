import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';
import type { EventWithProducer, RatingSummary } from '@/src/hooks/useEvents';

const RATING_MIN_TO_SHOW = 3;

type EventCardProps = {
  event: EventWithProducer;
  counts: Map<string, number> | undefined;
  producerView?: boolean;
  myAttendance?: Set<string>;
  ratingSummary?: RatingSummary;
  onToggleAttend?: (division: number) => void;
  onShowPartners?: (division: number) => void;
  onReport?: () => void;
};

// Mirrors buildEventCard() from the prototype - shared between the producer
// dashboard (counts only) and athlete-facing Events (attend toggle +
// Partners button + rating badge + report link).
export function EventCard({
  event,
  counts,
  producerView,
  myAttendance,
  ratingSummary,
  onToggleAttend,
  onShowPartners,
  onReport,
}: EventCardProps) {
  const ratingText =
    ratingSummary && ratingSummary.rating_count >= RATING_MIN_TO_SHOW
      ? `★ ${ratingSummary.avg_stars?.toFixed(1)} (${ratingSummary.rating_count} rating${ratingSummary.rating_count === 1 ? '' : 's'})`
      : 'Not enough ratings yet';

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{event.name}</Text>
      <Text style={styles.producerLine}>
        {event.producer_org_name} · {event.event_date}
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

      <View style={styles.divisionRow}>
        {event.divisions.map((d) => {
          const key = `${event.id}:${d}`;
          const count = counts?.get(key) ?? 0;
          const attending = myAttendance?.has(key) ?? false;
          return (
            <View key={d} style={styles.divisionPill}>
              {!producerView ? (
                <Pressable onPress={() => onToggleAttend?.(d)} style={[styles.attendCheck, attending && styles.attendCheckOn]}>
                  {attending ? <Ionicons name="checkmark" size={11} color={colors.cream} /> : null}
                </Pressable>
              ) : null}
              <Text style={styles.divisionText}>
                {d} <Text style={styles.divisionCount}>{count} attending</Text>
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

      {!producerView && onReport ? (
        <Pressable onPress={onReport} style={{ marginTop: 8 }}>
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
    borderColor: colors.rope,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 14,
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.leather },
  producerLine: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.rust, marginTop: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: '#6b5c47', marginTop: 4, lineHeight: 16 },
  rating: { fontSize: 12.5, fontFamily: fonts.bodyBold, marginTop: 6 },
  ratingActive: { color: colors.rust },
  ratingMuted: { color: '#6b5c47' },
  description: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, marginTop: 8, lineHeight: 17 },
  divisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  divisionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.rope,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 6,
    backgroundColor: colors.cream,
  },
  attendCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.rope,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendCheckOn: { backgroundColor: colors.green, borderColor: colors.green },
  divisionText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.leather },
  divisionCount: { fontSize: 10, color: colors.rust, fontFamily: fonts.bodyBold },
  partnersBtn: { backgroundColor: colors.leather, borderRadius: radii.sm, paddingVertical: 4, paddingHorizontal: 8 },
  partnersBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: colors.cream },
  reportLink: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', textDecorationLine: 'underline' },
});
