import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { COMMON_CAPS, OPEN_CAP, maxAllowedFor, neededOppositePosition } from '@/src/lib/matching';
import { useRegisterGoatRopingInterest, useMyGoatRopingInterest } from '@/src/hooks/useGoatRopingInterest';
import { useRequireSubscription } from '@/src/hooks/useSubscriptionStatus';
import { showToast } from '@/src/state/toast-store';

type Selection = { kind: 'cap'; value: number } | { kind: 'goat' } | null;

// Mirrors Screen 3 (#post). Numeric caps (plus "Open", which is really just
// the industry term for a #19 team - the max possible header(9) + heeler(10)
// combination, so it needs no special-cased math) still work exactly like
// the prototype: no database write, just the classification calculator
// handing off to Browse pre-filtered to the chosen cap. Goat Roping is
// different - it isn't bound by the number system at all, so selecting it
// registers interest and shows everyone else interested instead of running
// any classification math.
export default function Post() {
  const { data: me } = useMyProfile();
  const [selection, setSelection] = useState<Selection>(null);
  const registerGoatRoping = useRegisterGoatRopingInterest();
  const { data: alreadyInterested } = useMyGoatRopingInterest();
  const requireSubscription = useRequireSubscription();

  if (!me) return null;

  const cap = selection?.kind === 'cap' ? selection.value : null;
  const maxAllowed = cap !== null ? maxAllowedFor(cap, me.global_classification ?? 0) : null;
  const oppositePosition = neededOppositePosition(me.position);
  const capLabel = cap === OPEN_CAP ? 'Open' : cap;

  async function handleSubmit() {
    if (!requireSubscription()) return;

    if (selection?.kind === 'cap') {
      showToast(
        `Posted: need a ${oppositePosition.toLowerCase()} for the ${selection.value === OPEN_CAP ? 'Open' : selection.value} - showing your matches`
      );
      router.push({ pathname: '/(tabs)/browse', params: { cap: String(selection.value) } });
      return;
    }

    if (selection?.kind === 'goat') {
      try {
        await registerGoatRoping.mutateAsync();
        showToast('Posted: interested in Goat Roping - showing everyone else interested');
        router.push({ pathname: '/(tabs)/browse', params: { goatRoping: '1' } });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not post');
      }
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="We'll do the classification math for you" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Choose your event</Text>
        <View style={styles.pillRow}>
          {COMMON_CAPS.map((c) => (
            <Pill
              key={c}
              label={`#${c}`}
              selected={selection?.kind === 'cap' && selection.value === c}
              onPress={() => setSelection({ kind: 'cap', value: c })}
            />
          ))}
          <Pill
            label="Open"
            selected={selection?.kind === 'cap' && selection.value === OPEN_CAP}
            onPress={() => setSelection({ kind: 'cap', value: OPEN_CAP })}
          />
          <Pill label="Goat Roping" selected={selection?.kind === 'goat'} onPress={() => setSelection({ kind: 'goat' })} />
        </View>

        {selection?.kind === 'cap' ? (
          <>
            <View style={styles.capBanner}>
              <Text style={styles.capNum}>{maxAllowed}</Text>
              <Text style={styles.capLbl}>Max partner number allowed</Text>
            </View>
            <View style={styles.explain}>
              <Text style={styles.explainText}>
                {cap === OPEN_CAP ? (
                  <>
                    Open is capped at a #19 team - the highest possible combination (header 9 + heeler 10),
                    so every {oppositePosition.toLowerCase()} qualifies. Typically entered by professional
                    and/or elite athletes.
                  </>
                ) : (
                  <>
                    You're a {me.global_classification} {me.position.toLowerCase()}. In a #{capLabel} roping,
                    your {oppositePosition.toLowerCase()} needs to be classified at {maxAllowed} or lower.
                  </>
                )}
              </Text>
            </View>
            <Button label="Post & show me matches" onPress={handleSubmit} />
          </>
        ) : null}

        {selection?.kind === 'goat' ? (
          <>
            <DividerNote>
              Goat roping is usually a youth event and isn't bound by the classification number system.
              Posting here shows you everyone else interested in goat roping - not a header/heeler match.
            </DividerNote>
            <Button
              label={alreadyInterested ? "You're already posted - show me everyone interested" : 'Post & show me everyone interested'}
              onPress={handleSubmit}
              loading={registerGoatRoping.isPending}
            />
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
