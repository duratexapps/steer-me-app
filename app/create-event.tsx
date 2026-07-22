import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState('');
  const [divisions, setDivisions] = useState<number[]>([]);
  const [description, setDescription] = useState('');
  const [flierOpen, setFlierOpen] = useState(false);
  const [flierUri, setFlierUri] = useState<string | null>(null);
  const [flierPath, setFlierPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDivision(d: number) {
    setDivisions((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleFlierPicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setFlierUri(image.uri);
    try {
      const path = await uploadUserFile('event-fliers', user.id, image, `flier-${Date.now()}`);
      setFlierPath(path);
    } catch {
      showToast('Could not upload flier - try again');
    }
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
        flier_path: flierPath,
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
      <ScreenHeader title="Create Event" subtitle="Listed under your verified producer profile" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
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

        <Text style={[styles.label, { marginTop: 16 }]}>Event flier (optional)</Text>
        <Pressable style={styles.dropzone} onPress={() => setFlierOpen(true)}>
          {flierUri ? (
            <>
              <Image source={{ uri: flierUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Flier attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Upload your event flier</Text>
              <Text style={styles.dropzoneSub}>Shown to everyone browsing Events</Text>
            </>
          )}
        </Pressable>

        <Button label="Post event" onPress={handleSubmit} loading={submitting} style={{ marginTop: 8 }} />
      </ScrollView>
      <PhotoChooserSheet visible={flierOpen} onClose={() => setFlierOpen(false)} onPicked={handleFlierPicked} />
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="create-event" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36 },
  helper: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 14, lineHeight: 16 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    backgroundColor: colors.tanLight,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  dropzone: {
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  dropzoneImage: { width: '100%', height: 140, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6 },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2 },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
