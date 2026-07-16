import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

type PartnerCardProps = {
  partner: PublicProfile;
  alreadyRequested: boolean;
  nearby?: boolean;
  onRequest?: () => void;
  onReport: () => void;
  onBlock: () => void;
};

// Mirrors the Browse .card rows - tag/name/area/position badge, guardian
// note for minors, report/block links, and the request button. The request
// button is omitted entirely when onRequest isn't provided - used for Goat
// Roping's "who else is interested" discovery list, which has no
// header/heeler team or classification-cap concept to request against.
export function PartnerCard({ partner, alreadyRequested, nearby, onRequest, onReport, onBlock }: PartnerCardProps) {
  return (
    <View style={styles.card}>
      <Tag value={partner.global_classification} />
      <View style={styles.info}>
        <Text style={styles.name}>{partner.full_name}</Text>
        <Text style={styles.meta}>{partner.home_area}</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.posBadge}>{partner.position}</Text>
          {partner.is_minor ? <Text style={[styles.posBadge, styles.rustBadge]}>Guardian approval</Text> : null}
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
    borderColor: colors.rope,
    borderLeftWidth: 4,
    borderLeftColor: colors.rust,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
  },
  info: { flex: 1 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.leather, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  posBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.cream,
    backgroundColor: colors.green,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rustBadge: { backgroundColor: colors.rust },
  greenBadge: { backgroundColor: colors.green },
  linkRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  reportLink: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', textDecorationLine: 'underline' },
  blockLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.rust,
    textDecorationLine: 'underline',
  },
  reqBtn: { backgroundColor: colors.leather, borderRadius: radii.sm, paddingVertical: 8, paddingHorizontal: 12 },
  reqBtnDisabled: { backgroundColor: colors.rope },
  reqBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.cream },
});
