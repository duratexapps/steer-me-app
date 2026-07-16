import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useCreateEvent } from '@/src/hooks/useEvents';
import { DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

// Divisions are picked from the exact same option set as Post a Need
// (DIVISION_OPTIONS) rather than typed in as free text - a producer can no
// longer introduce a division that isn't a real roping cap (there's no
// #12 or #15, those are #12.5/#15.5; there's no #20, the max is a #19
// team and anything at or above that is Open).
export default function CreateEvent() {
  const createEvent = useCreateEvent();
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState('');
  const [divisions, setDivisions] = useState<number[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleDivision(d: number) {
    setDivisions((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleSubmit() {
    if (!name.trim() || !date || !location.trim() || divisions.length === 0) {
      showToast('Fill in event name, date, location, and at least one division');
      return;
    }

    setSubmitting(true);
    try {
      await createEvent.mutateAsync({
        name: name.trim(),
        event_date: date,
        location: location.trim(),
        entry_fee: fee.trim() || 'See listing',
        divisions,
        description: description.trim() || 'No description provided.',
      });
      showToast(`"${name.trim()}" posted`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post event');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Create Event" subtitle="Listed under your verified producer profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <TextField label="Event name" value={name} onChangeText={setName} placeholder="e.g. Fall Qualifier" />
        <DateField label="Date" value={date} onChange={setDate} minimumDate={new Date()} />
        <TextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Wickenburg, AZ" />
        <TextField label="Entry fee" value={fee} onChangeText={setFee} placeholder="e.g. $300/team" />

        <Text style={styles.label}>Divisions / classification caps</Text>
        <View style={styles.pillWrap}>
          {DIVISION_OPTIONS.map((d) => (
            <Pill
              key={d}
              label={d === OPEN_CAP ? 'Open' : `#${d}`}
              selected={divisions.includes(d)}
              onPress={() => toggleDivision(d)}
            />
          ))}
        </View>
        <Text style={styles.helper}>Tap every class you're running - at least one required.</Text>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textarea}
          value={description}
          onChangeText={setDescription}
          placeholder="Details ropers should know - cattle, added money, format..."
          placeholderTextColor="#9c8a6b"
          multiline
          numberOfLines={4}
        />

        <Button label="Post event" onPress={handleSubmit} loading={submitting} style={{ marginTop: 14 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
  helper: { fontFamily: fonts.body, fontSize: 12, color: '#6b5c47', marginBottom: 14, lineHeight: 16 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.leather,
    marginBottom: 6,
  },
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.rope,
    borderRadius: radii.md,
    backgroundColor: colors.tanLight,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
