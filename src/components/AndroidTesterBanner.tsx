import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '@/src/theme/theme';

// NEW, added 2026-07-30 - real ask, directly from the user, while the
// real Android app sits in Google Play's Internal Testing track (a
// closed group, up to 100 testers, no public listing yet): recruit
// testers directly from the web version, since that's the only
// public-facing surface Steer Me has right now. Web-only - a native app
// user has no need to be told how to get the native app, they're
// already using it. Dismissible, not persisted across reloads - this is
// a temporary recruitment push, not a permanent fixture, so it doesn't
// need the complexity of AsyncStorage-backed "seen it once" tracking.
export function AndroidTesterBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (Platform.OS !== 'web' || dismissed) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="logo-android" size={22} color={colors.brass} style={styles.icon} />
      <Text style={styles.text}>
        Have an Android device? Help us test the real Steer Me app before it launches - email{' '}
        <Text style={styles.email}>support@ropingtools.com</Text> with your Google Play email address and we'll add
        you to our tester group so you can download it early.
      </Text>
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
  icon: { marginTop: 2 },
  text: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.ink,
    lineHeight: 18,
  },
  email: { fontFamily: fonts.bodyBold, color: colors.brass },
  closeBtn: { padding: 2 },
});
