import { StyleSheet, Text, View } from 'react-native';
import { Pill } from '@/src/components/ui/Pill';
import { TextField } from '@/src/components/ui/TextField';
import { colors, fonts } from '@/src/theme/theme';
import {
  CLASS_CHOICES,
  SELF_REPORTED_DISCLAIMER,
  type MoneyWon,
  type RopingsPerMonth,
  type SelfAssessment,
  type WinVsSpend,
} from '@/src/lib/self-rating';

type Props = {
  value: SelfAssessment;
  onChange: (next: SelfAssessment) => void;
};

// The short "how do you rate yourself" questions shown to ropers who do not have a Global card. Plain taps,
// no free typing except the optional prior number and references. See src/lib/self-rating.ts for how the
// answers are used (a consistency check, never a rating).
export function SelfAssessmentForm({ value, onChange }: Props) {
  const set = <K extends keyof SelfAssessment>(key: K, v: SelfAssessment[K]) => onChange({ ...value, [key]: v });
  const num = (s: string): number | null => {
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  };

  const monthly: { id: RopingsPerMonth; label: string }[] = [
    { id: '0-1', label: '0 to 1' },
    { id: '2-3', label: '2 to 3' },
    { id: '4-8', label: '4 to 8' },
    { id: '9+', label: '9 or more' },
  ];
  const money: { id: MoneyWon; label: string }[] = [
    { id: 'never', label: 'Never' },
    { id: 'a_few', label: 'A few times' },
    { id: 'often', label: 'Often' },
  ];
  const spend: { id: WinVsSpend; label: string }[] = [
    { id: 'yes', label: 'Yes' },
    { id: 'even', label: 'About even' },
    { id: 'no', label: 'No' },
  ];

  return (
    <View>
      <Text style={styles.intro}>
        No Global card? No problem. A few quick questions help partners and producers trust your number. This is
        Steer Me's own check, not Global's.
      </Text>

      <Text style={styles.q}>Biggest team class you entered in the last 12 months</Text>
      <View style={styles.wrap}>
        {CLASS_CHOICES.map((c) => (
          <Pill
            key={c}
            label={c === 19 ? 'Open' : `#${c}`}
            selected={value.highestClassEntered === c}
            onPress={() => set('highestClassEntered', c)}
          />
        ))}
      </View>

      <Text style={styles.q}>About how many ropings a month</Text>
      <View style={styles.wrap}>
        {monthly.map((m) => (
          <Pill key={m.id} label={m.label} selected={value.ropingsPerMonth === m.id} onPress={() => set('ropingsPerMonth', m.id)} />
        ))}
      </View>

      <Text style={styles.q}>How often did you win money in your best class</Text>
      <View style={styles.wrap}>
        {money.map((m) => (
          <Pill key={m.id} label={m.label} selected={value.moneyWon === m.id} onPress={() => set('moneyWon', m.id)} />
        ))}
      </View>

      <Text style={styles.q}>In a jackpot, about how many of 10 runs do you catch</Text>
      <View style={styles.wrap}>
        {Array.from({ length: 11 }, (_, i) => (
          <Pill key={i} label={String(i)} selected={value.catchOutOf10 === i} onPress={() => set('catchOutOf10', i)} />
        ))}
      </View>

      <Text style={styles.q}>Do you usually win more than you spend</Text>
      <View style={styles.wrap}>
        {spend.map((m) => (
          <Pill key={m.id} label={m.label} selected={value.winMoreThanSpend === m.id} onPress={() => set('winMoreThanSpend', m.id)} />
        ))}
      </View>

      <TextField
        label="Highest number any organization has ever given you (optional)"
        value={value.priorNumber == null ? '' : String(value.priorNumber)}
        onChangeText={(t) => set('priorNumber', num(t))}
        placeholder="e.g. 5.5"
        keyboardType="decimal-pad"
      />
      <TextField
        label="About how many years ago (optional)"
        value={value.priorNumberYearsAgo == null ? '' : String(value.priorNumberYearsAgo)}
        onChangeText={(t) => set('priorNumberYearsAgo', num(t))}
        placeholder="e.g. 2"
        keyboardType="number-pad"
      />
      <TextField
        label="Years roping (optional)"
        value={value.yearsRoping == null ? '' : String(value.yearsRoping)}
        onChangeText={(t) => set('yearsRoping', num(t))}
        placeholder="e.g. 6"
        keyboardType="number-pad"
      />
      <TextField
        label="Ropers or producers who know your roping (optional)"
        value={value.references.join(', ')}
        onChangeText={(t) =>
          set(
            'references',
            t
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 3)
          )
        }
        placeholder="Up to three names, separated by commas"
      />

      <Text style={styles.disclaimer}>{SELF_REPORTED_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, lineHeight: 17, marginBottom: 12 },
  q: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
    marginTop: 4,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  disclaimer: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11.5,
    color: colors.saddle,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 12,
  },
});
