import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors } from '@/src/theme/theme';

// Placeholder for Phase 3 - eligible-partner matching, location toggle,
// event-scoped browse, block/report actions all land here.
export default function Browse() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Eligible Partners" subtitle="Showing ropers you can legally partner with" />
      <View style={styles.content}>
        <DividerNote>Browse is coming in a later update as this build continues.</DividerNote>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
});
