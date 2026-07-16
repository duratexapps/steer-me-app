import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Tag } from '@/src/components/ui/Tag';
import { colors, fonts, radii } from '@/src/theme/theme';
import { publicUrlFor } from '@/src/lib/storage-upload';
import { formatDivision } from '@/src/lib/matching';
import { formatDateDisplay } from '@/src/lib/date';
import type { NeedPostWithPoster } from '@/src/hooks/useNeedPosts';

type NeedPostCardProps = {
  post: NeedPostWithPoster;
  alreadyRequested?: boolean;
  onRequest?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
  onDelete?: () => void;
};

// A posted need, browsable by anyone eligible to fill it - shows the event
// details (date, producer, flier, Facebook link) the user asked for so
// other athletes can judge schedule/availability before responding, and so
// a producer who isn't on Steer Me yet still gets their name and flier
// seen by everyone who views the post.
export function NeedPostCard({ post, alreadyRequested, onRequest, onReport, onBlock, onDelete }: NeedPostCardProps) {
  const flierUrl = publicUrlFor('need-fliers', post.flier_path);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        {post.poster ? <Tag value={post.poster.global_classification} /> : null}
        <View style={styles.info}>
          <Text style={styles.eventName}>{post.event_name}</Text>
          <Text style={styles.meta}>
            {formatDateDisplay(post.event_date)} · {post.producer_name}
          </Text>
          {post.poster ? (
            <Text style={styles.posterLine}>
              Posted by {post.poster.full_name} · {post.poster.position} · {post.poster.home_area}
            </Text>
          ) : null}
          <Text style={styles.divisionBadge}>{formatDivision(post.division, post.is_goat_roping)}</Text>
        </View>
      </View>

      {flierUrl ? <Image source={{ uri: flierUrl }} style={styles.flier} contentFit="cover" /> : null}

      {post.facebook_link ? (
        <Pressable onPress={() => Linking.openURL(post.facebook_link!)}>
          <Text style={styles.fbLink}>View event on Facebook</Text>
        </Pressable>
      ) : null}

      <View style={styles.actionRow}>
        {onReport ? (
          <Pressable onPress={onReport}>
            <Text style={styles.reportLink}>Report</Text>
          </Pressable>
        ) : null}
        {onBlock ? (
          <Pressable onPress={onBlock}>
            <Text style={styles.blockLink}>Block</Text>
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable onPress={onDelete}>
            <Text style={styles.blockLink}>Delete</Text>
          </Pressable>
        ) : null}
        {onRequest ? (
          <Pressable onPress={onRequest} disabled={alreadyRequested} style={[styles.reqBtn, alreadyRequested && styles.reqBtnDisabled]}>
            <Text style={styles.reqBtnText}>{alreadyRequested ? 'Sent' : "I'm interested"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.rope,
    borderLeftWidth: 4,
    borderLeftColor: colors.rust,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 14,
  },
  headRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  info: { flex: 1 },
  eventName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.leather },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.ink, marginTop: 2 },
  posterLine: { fontFamily: fonts.body, fontSize: 11.5, color: '#6b5c47', marginTop: 4 },
  divisionBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.cream,
    backgroundColor: colors.green,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  flier: { width: '100%', height: 140, borderRadius: radii.md, marginTop: 10 },
  fbLink: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.leather, marginTop: 8, textDecorationLine: 'underline' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  reportLink: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', textDecorationLine: 'underline' },
  blockLink: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.rust, textDecorationLine: 'underline' },
  reqBtn: { marginLeft: 'auto', backgroundColor: colors.leather, borderRadius: radii.sm, paddingVertical: 8, paddingHorizontal: 12 },
  reqBtnDisabled: { backgroundColor: colors.rope },
  reqBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.cream },
});
