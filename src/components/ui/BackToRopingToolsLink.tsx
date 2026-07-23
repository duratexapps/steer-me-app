import { Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

// Web-only - a native app user arrived via the App/Play Store, not by
// browsing ropingtools.com, so "return to the site" doesn't apply to
// them. Scoped to just the two pre-authentication entry points
// (role-select, sign-in) per explicit request, not added to the shared
// ScreenHeader the way Report an Issue was - this isn't meant to show up
// on every screen, only wherever a user coming from the main site would
// land depending on whether they're new or already have an account.
export function BackToRopingToolsLink() {
  if (Platform.OS !== 'web') return null;

  return (
    <Pressable style={styles.bar} onPress={() => Linking.openURL('https://www.ropingtools.com')}>
      <Text style={styles.text}>← Back to RopingTools.com</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.espressoDark,
    paddingVertical: 8,
    paddingHorizontal: 20,
    cursor: 'pointer',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.tan,
  },
});
