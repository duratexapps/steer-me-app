import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors, fonts } from '@/src/theme/theme';
import {
  UNDER_AGE_MESSAGE,
  checkBirthMonthYear,
  isAgeLocked,
  recordAgeGateBlocked,
  recordAgeGatePassed,
} from '@/src/lib/age-gate';

// The age screen shown before an email address or any profile detail is collected. See src/lib/age-gate.ts for the
// reasoning and for what is (and is not) stored. Once an under-13 answer is given the screen shows only the stop
// message: no field, no "try again" button, and the lock keeps it that way on this device.
export function AgeGate({ onPassed, onLeave }: { onPassed: () => void; onLeave: () => void }) {
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    isAgeLocked().then((locked) => {
      if (!alive) return;
      setBlocked(locked);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleContinue() {
    const result = checkBirthMonthYear(month, year);
    if (result.ok) {
      setError(null);
      await recordAgeGatePassed();
      onPassed();
      return;
    }
    if (result.reason === 'under') {
      await recordAgeGateBlocked();
      setMonth('');
      setYear('');
      setBlocked(true);
      return;
    }
    setError(result.message);
  }

  if (checking) return null;

  if (blocked) {
    return (
      <View>
        <DividerNote>{UNDER_AGE_MESSAGE}</DividerNote>
        <Button label="Back" variant="outline" onPress={onLeave} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.heading}>Before we start</Text>
      <Text style={styles.helper}>Enter your birth month and year. We use this only to set up your account, and we don't keep it.</Text>
      <TextField
        label="Birth month (1 to 12)"
        value={month}
        onChangeText={(v) => {
          setMonth(v.replace(/\D/g, '').slice(0, 2));
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="e.g. 7"
        maxLength={2}
      />
      <TextField
        label="Birth year"
        value={year}
        onChangeText={(v) => {
          setYear(v.replace(/\D/g, '').slice(0, 4));
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="e.g. 1985"
        maxLength={4}
      />
      {error ? <DividerNote>{error}</DividerNote> : null}
      <Button label="Continue" onPress={() => void handleContinue()} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, marginBottom: 6 },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17 },
});
