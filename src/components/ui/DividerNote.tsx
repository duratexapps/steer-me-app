import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '@/src/theme/theme';

// Mirrors .divider-note - the hairline callout box used throughout the
// prototype for guideline text, pricing notes, and empty states.
export function DividerNote({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 14,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.espresso,
    lineHeight: 17,
  },
});
