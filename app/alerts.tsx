import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { Pill } from '@/src/components/ui/Pill';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { goBackOrHome } from '@/src/lib/navigation';
import { showToast } from '@/src/state/toast-store';
import { DEFAULT_ALERT_PREFS, useAlertPrefs, useSaveAlertPrefs, type AlertPrefs } from '@/src/hooks/useAlertPrefs';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { MILES_OPTIONS } from '@/src/lib/event-filters';

// Roping alerts, phase 1 (Justin, 2026-11-07; plan in DOCS/plan-a-roping-alerts-first-paid-feature-2026-11-07.md): the free
// weekly list of ropings near the member's home area, emailed Mondays at 7 AM Central. Instant alerts for paying members
// are phase 2 and are only mentioned here, not built. Distance choices are the same as the Events screen's pills so an
// alert and the Events screen never disagree.

function parseClass(text: string): { value: number | null; error: string | null } {
  const t = text.trim();
  if (t === '') return { value: null, error: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 30) return { value: null, error: 'Enter a number from 0 to 30, like 8.5' };
  return { value: Math.round(n * 2) / 2, error: null };
}

export default function Alerts() {
  const { data, isLoading } = useAlertPrefs();
  const save = useSaveAlertPrefs();
  const { data: profile } = useMyProfile();
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setPrefs(data.prefs);
    setMinText(data.prefs.class_min == null ? '' : String(data.prefs.class_min));
    setMaxText(data.prefs.class_max == null ? '' : String(data.prefs.class_max));
  }, [data]);

  const set = <K extends keyof AlertPrefs>(key: K, value: AlertPrefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  async function handleSave() {
    const min = parseClass(minText);
    const max = parseClass(maxText);
    if (min.error || max.error) {
      setError(min.error ?? max.error);
      return;
    }
    if (min.value != null && max.value != null && min.value > max.value) {
      setError('The first number has to be the lower one.');
      return;
    }
    if (!prefs.include_jackpots && !prefs.include_clinics && !prefs.include_practices) {
      setError('Pick at least one type to include.');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({ ...prefs, class_min: min.value, class_max: max.value });
      showToast('Roping alerts saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    }
  }

  const home = profile?.home_area;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Roping alerts" subtitle="Know what's posted near you" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isLoading ? null : (
          <>
            <ToggleRow
              title="Weekly list, free"
              description={`Ropings near ${home ?? 'your home area'} for the week ahead, emailed Mondays at 7 AM Central.`}
              value={prefs.weekly}
              onToggle={() => set('weekly', !prefs.weekly)}
            />

            <Text style={styles.label}>How far will you haul?</Text>
            <View style={styles.pills}>
              {MILES_OPTIONS.map((o) => (
                <Pill key={String(o.value)} label={o.label.replace('Within ', '')} selected={prefs.radius_miles === o.value} onPress={() => set('radius_miles', o.value)} />
              ))}
            </View>

            <Text style={styles.label}>What to include</Text>
            <View style={styles.pills}>
              <Pill label="Jackpots" selected={prefs.include_jackpots} onPress={() => set('include_jackpots', !prefs.include_jackpots)} />
              <Pill label="Clinics & schools" selected={prefs.include_clinics} onPress={() => set('include_clinics', !prefs.include_clinics)} />
              <Pill label="Practices" selected={prefs.include_practices} onPress={() => set('include_practices', !prefs.include_practices)} />
            </View>

            <Text style={styles.label}>Only these jackpot classes (optional)</Text>
            <Text style={styles.hint}>
              Leave both blank to see every class. Example: 8.5 to 10.5 shows ropings with a class in that range.
              {profile?.global_classification != null ? ` Your number is ${profile.global_classification}.` : ''}
            </Text>
            <View style={styles.classRow}>
              <View style={{ flex: 1 }}>
                <TextField label="From #" value={minText} onChangeText={(v) => { setMinText(v); setError(null); }} keyboardType="decimal-pad" placeholder="e.g. 8.5" maxLength={4} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="To #" value={maxText} onChangeText={(v) => { setMaxText(v); setError(null); }} keyboardType="decimal-pad" placeholder="e.g. 10.5" maxLength={4} />
              </View>
            </View>

            {error ? <DividerNote>{error}</DividerNote> : null}
            <Button label="Save" onPress={() => void handleSave()} loading={save.isPending} />

            <Button
              label="See this week near me"
              variant="outline"
              style={{ marginTop: 10 }}
              onPress={() => router.push({ pathname: '/events', params: { dateWindow: 'week', ...(prefs.radius_miles != null ? { maxMiles: String(prefs.radius_miles) } : {}) } })}
            />

            <DividerNote>
              Instant alerts the moment a roping is posted are coming for members. The weekly list stays free.
            </DividerNote>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.espresso, marginBottom: 8 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, lineHeight: 17, marginBottom: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  classRow: { flexDirection: 'row', gap: 12 },
});
