import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatPosition } from '@/src/lib/matching';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

type PartnerCardProps = {
  partner: PublicProfile;
  alreadyRequested: boolean;
  nearby?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRequest?: () => void;
  onReport: () => void;
  onBlock: () => void;
};

// Mirrors the Browse .card rows - tag/name/area/position badge, guardian
// note for minors, report/block links, and the request button. The request
// button is omitted entirely when onRequest isn't provided - used for Goat
// Roping's "who else is interested" discovery list, which has no
// header/heeler team or classification-cap concept to request against.
// The favorite star is optional (omitted anywhere there's no toggle wired
// up for it).
export function PartnerCard({
  partner,
  alreadyRequested,
  nearby,
  isFavorite,
  onToggleFavorite,
  onRequest,
  onReport,
  onBlock,
}: PartnerCardProps) {
  return (
    <View style={styles.card}>
      <Tag value={partner.global_classification} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{partner.full_name}</Text>
          {onToggleFavorite ? (
            <Pressable onPress={onToggleFavorite} hitSlop={8}>
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={18}
                color={isFavorite ? colors.brass : colors.saddle}
              />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.meta}>{partner.home_area}</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.posBadge}>{formatPosition(partner.position)}</Text>
          {partner.is_minor ? <Text style={[styles.posBadge, styles.brassBadge]}>Guardian approval</Text> : null}
          {nearby ? <Text style={[styles.posBadge, styles.greenBadge]}>Nearby now</Text> : null}
        </View>
        <View style={styles.linkRow}>
          <Pressable onPress={onReport}>
            <Text style={styles.reportLink}>Report</Text>
          </Pressable>
          <Pressable onPress={onBlock}>
            <Text style={styles.blockLink}>Block</Text>
          </Pressable>
        </View>
      </View>
      {onRequest ? (
        <Pressable
          onPress={onRequest}
          disabled={alreadyRequested}
          style={[styles.reqBtn, alreadyRequested && styles.reqBtnDisabled]}
        >
          <Text style={styles.reqBtnText}>{alreadyRequested ? 'Sent' : 'Request'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderLeftWidth: 4,
    borderLeftColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.espresso, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  posBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.bone,
    backgroundColor: colors.green,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  brassBadge: { backgroundColor: colors.brass },
  greenBadge: { backgroundColor: colors.green },
  linkRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  reportLink: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, textDecorationLine: 'underline' },
  blockLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.brass,
    textDecorationLine: 'underline',
  },
  reqBtn: { backgroundColor: colors.espresso, borderRadius: radii.sm, paddingVertical: 8, paddingHorizontal: 12 },
  reqBtnDisabled: { backgroundColor: colors.saddle },
  reqBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.bone },
});
