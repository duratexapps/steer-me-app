import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useReferralStats } from '@/src/hooks/useReferralStats';
import { showToast } from '@/src/state/toast-store';

// NEW, added 2026-07-27 - "refer a friend," reachable from every screen
// via ScreenHeader's gift icon (see that file). Reward mechanics live in
// migration 0034 + revenuecat-webhook - this screen is purely display +
// sharing, no reward logic of its own.
export default function Referral() {
  const { data: profile } = useMyProfile();
  const { data: stats } = useReferralStats();

  async function handleShare() {
    if (!profile?.referral_code) return;
    const message =
      `Join me on Steer Me - find your own team roping partner and skip the draw-in fee. ` +
      `Use my code ${profile.referral_code} when you sign up and we both get a free month once you subscribe!`;
    try {
      // Web has no native Share sheet - Share.share() throws there, so
      // fall back to copying the message instead of leaving the button
      // silently broken.
      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(message);
        showToast('Copied - paste it anywhere to share');
        return;
      }
      await Share.share({ message });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open share sheet');
    }
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Refer a Friend" onBack={() => router.back()} />
        <View style={styles.content}>
          <DividerNote>Sign in to get your own referral code.</DividerNote>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Refer a Friend" subtitle="You both get a free month" onBack={() => router.back()} />
      <View style={styles.content}>
        <DividerNote>
          Share your code with a friend. Once they sign up and subscribe, you'll both get a free month -
          automatically, no need to contact us.
        </DividerNote>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your referral code</Text>
          <Text style={styles.codeValue}>{profile.referral_code}</Text>
        </View>

        <Button label="Share my code" onPress={handleShare} style={styles.shareBtn} />

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats?.referred_count ?? 0}</Text>
            <Text style={styles.statLabel}>Friends signed up</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats?.rewarded_count ?? 0}</Text>
            <Text style={styles.statLabel}>Free months earned</Text>
          </View>
        </View>

        {profile.referred_by ? (
          <DividerNote>
            You joined using a friend's referral code
            {profile.referral_reward_granted_at
              ? ' - your free month has been applied.'
              : " - you'll both get a free month once you subscribe."}
          </DividerNote>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, padding: 20, ...webMaxWidth },
  codeCard: {
    backgroundColor: colors.tanLight,
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  codeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.saddle,
    marginBottom: 6,
  },
  codeValue: {
    fontFamily: fonts.mono,
    fontSize: 28,
    color: colors.espresso,
    letterSpacing: 2,
  },
  shareBtn: { marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
  },
  statNum: { fontFamily: fonts.mono, fontSize: 24, color: colors.brass },
  statLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.espresso,
    textAlign: 'center',
    marginTop: 4,
  },
});
