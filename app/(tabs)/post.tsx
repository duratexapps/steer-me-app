import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { COMMON_CAPS, maxAllowedFor, neededOppositePosition } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

// Mirrors Screen 3 (#post). No database write happens here, matching the
// prototype: there's no "posted needs" table - this is purely the
// classification calculator that hands off to Browse pre-filtered to the
// chosen cap.
export default function Post() {
  const { data: me } = useMyProfile();
  const [cap, setCap] = useState<number | null>(null);

  if (!me) return null;

  const maxAllowed = cap !== null ? maxAllowedFor(cap, me.global_classification ?? 0) : null;
  const oppositePosition = neededOppositePosition(me.position);

  function handleSubmit() {
    if (cap === null) return;
    showToast(`Posted: need a ${oppositePosition.toLowerCase()} for the ${cap} - showing your matches`);
    router.push({ pathname: '/(tabs)/browse', params: { cap: String(cap) } });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="We'll do the classification math for you" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Choose your event</Text>
        <View style={styles.pillRow}>
          {COMMON_CAPS.map((c) => (
            <Pill key={c} label={`${c} Roping`} selected={cap === c} onPress={() => setCap(c)} />
          ))}
        </View>

        {cap !== null ? (
          <>
            <View style={styles.capBanner}>
              <Text style={styles.capNum}>{maxAllowed}</Text>
              <Text style={styles.capLbl}>Max partner number allowed</Text>
            </View>
            <View style={styles.explain}>
              <Text style={styles.explainText}>
                You're a {me.global_classification} {me.position.toLowerCase()}. In a {cap} roping, your{' '}
                {oppositePosition.toLowerCase()} needs to be classified at {maxAllowed} or lower.
              </Text>
            </View>
            <Button label="Post & show me matches" onPress={handleSubmit} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.rust,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  capBanner: {
    backgroundColor: colors.tan,
    borderWidth: 1.5,
    borderColor: colors.leather,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  capNum: { fontFamily: fonts.mono, fontSize: 26, color: colors.rust },
  capLbl: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.leather,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  explain: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.rope,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
  },
  explainText: { fontFamily: fonts.body, fontSize: 12, color: colors.leather, lineHeight: 17 },
});
