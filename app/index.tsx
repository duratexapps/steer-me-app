import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

// Placeholder root screen for the Phase 0 scaffold smoke test.
// Phase 2 replaces this with real session-based routing to
// (auth)/role-select, (auth)/sign-in, or (tabs)/home.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Steer Me</Text>
      <Text style={styles.sub}>Scaffold is running. Screens land in later phases.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.leather,
    letterSpacing: 1.5,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    marginTop: 8,
    textAlign: 'center',
  },
});
