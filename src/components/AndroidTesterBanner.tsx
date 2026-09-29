import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.duratexapplications.steerme';
const APP_STORE_URL = 'https://apps.apple.com/app/id6805227345';

// UPDATED 2026-09-29 - iOS build 1.3.5 (9) went live on the App Store, so
// the iPhone row is no longer a placeholder: it links out the same way the
// Android row always has. Web-only - a native app user has no need to be
// told how to get the native app, they're already using it. Dismissible,
// not persisted across reloads, same as before.
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
        <Pressable style={styles.row} onPress={() => Linking.openURL(APP_STORE_URL)}>
          <Ionicons name="logo-apple" size={20} color={colors.saddle} style={styles.icon} />
          <Text style={styles.text}>
            Now available on the App Store - <Text style={styles.linkText}>download it now</Text>.
          </Text>
        </Pressable>
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
