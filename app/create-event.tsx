import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useCreateEvent } from '@/src/hooks/useEvents';
import { showToast } from '@/src/state/toast-store';

export default function CreateEvent() {
  const createEvent = useCreateEvent();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState('');
  const [divisionsRaw, setDivisionsRaw] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !date.trim() || !location.trim() || !divisionsRaw.trim()) {
      showToast('Fill in event name, date, location, and at least one division');
      return;
    }
    const divisions = divisionsRaw
      .split(',')
      .map((d) => parseFloat(d.trim()))
      .filter((d) => !Number.isNaN(d));
    if (divisions.length === 0) {
      showToast('Enter at least one valid division, e.g. 10.5, 12');
      return;
    }

    setSubmitting(true);
    try {
      await createEvent.mutateAsync({
        name: name.trim(),
        event_date: date.trim(),
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
        <TextField label="Date" value={date} onChangeText={setDate} placeholder="e.g. Sep 20, 2026" />
        <TextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Wickenburg, AZ" />
        <TextField label="Entry fee" value={fee} onChangeText={setFee} placeholder="e.g. $300/team" />
        <TextField
          label="Divisions / classification caps"
          value={divisionsRaw}
          onChangeText={setDivisionsRaw}
          placeholder="e.g. 10.5, 12, 15"
        />
        <Text style={styles.helper}>Separate multiple divisions with commas - one per class you're running.</Text>

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
  helper: { fontFamily: fonts.body, fontSize: 12, color: '#6b5c47', marginTop: -8, marginBottom: 14, lineHeight: 16 },
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
