import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors } from '@/src/theme/theme';

// Placeholder for Phase 3 - event-cap picker and the "max partner number
// allowed" math land here.
export default function Post() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="We'll do the classification math for you" />
      <View style={styles.content}>
        <DividerNote>Posting a need is coming in a later update as this build continues.</DividerNote>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
});
