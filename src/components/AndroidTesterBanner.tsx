import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.duratexapplications.steerme';

// UPDATED 2026-08-16 - real ask, directly from the user: the Android app
// (originally pushed to Google Play's Internal Testing track, not meant to
// be public yet) turned out to already be a real, searchable Play Store
// listing reachable by anyone with the link - not the closed 100-tester
// group this banner originally assumed. Rather than keep asking people to
// email in for tester access, link straight to the real listing. iOS has
// no equivalent yet (no App Store submission has happened) - shown as a
// plain "coming soon" line, not a link, so it doesn't imply a listing that
// doesn't exist. Web-only - a native app user has no need to be told how
// to get the native app, they're already using it. Dismissible, not
// persisted across reloads, same as before.
export function AndroidTesterBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (Platform.OS !== 'web' || dismissed) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.rows}>
        <Pressable style={styles.row} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
          <Ionicons name="logo-google-playstore" size={20} color={colors.brass} style={styles.icon} />
          <Text style={styles.text}>
            The real Steer Me app is on Google Play - <Text style={styles.linkText}>download it now</Text>.
          </Text>
        </Pressable>
        <View style={styles.row}>
          <Ionicons name="logo-apple" size={20} color={colors.saddle} style={styles.icon} />
          <Text style={styles.text}>iPhone app - coming soon.</Text>
        </View>
      </View>
      <Pressable onPress={() => setDismissed(true)} hitSlop={10} style={styles.closeBtn}>
        <Ionicons name="close" size={18} color={colors.saddle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  rows: { flex: 1, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {},
  text: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.ink,
    lineHeight: 18,
  },
  linkText: { fontFamily: fonts.bodyBold, color: colors.brass, textDecorationLine: 'underline' },
  closeBtn: { padding: 2 },
});
