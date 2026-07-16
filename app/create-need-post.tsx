import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { useCreateNeedPost } from '@/src/hooks/useNeedPosts';
import { showToast } from '@/src/state/toast-store';

type Selection = { kind: 'cap'; value: number } | { kind: 'goat' } | null;

// The event details this collects (date, event name, producer name,
// optional flier + Facebook link) are what makes a posted need a real
// browsable listing instead of a private calculator - other athletes use
// them to judge schedule/availability, and a producer who isn't on Steer
// Me yet still gets surfaced to everyone who sees the post.
export default function CreateNeedPost() {
  const createNeedPost = useCreateNeedPost();
  const [selection, setSelection] = useState<Selection>(null);
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [producerName, setProducerName] = useState('');
  const [facebookLink, setFacebookLink] = useState('');
  const [flierOpen, setFlierOpen] = useState(false);
  const [flierUri, setFlierUri] = useState<string | null>(null);
  const [flierPath, setFlierPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFlierPicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setFlierUri(image.uri);
    try {
      const path = await uploadUserFile('need-fliers', user.id, image, `flier-${Date.now()}`);
      setFlierPath(path);
    } catch {
      showToast('Could not upload flier - try again');
    }
  }

  const canSubmit = selection !== null && !!eventDate && eventName.trim().length > 0 && producerName.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || !selection || !eventDate) return;
    setSubmitting(true);
    try {
      await createNeedPost.mutateAsync({
        is_goat_roping: selection.kind === 'goat',
        division: selection.kind === 'cap' ? selection.value : null,
        event_date: eventDate,
        event_name: eventName.trim(),
        producer_name: producerName.trim(),
        flier_path: flierPath,
        facebook_link: facebookLink.trim() || null,
      });
      showToast(`Posted: need a partner for ${eventName.trim()}`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Need" subtitle="Give others the details to check their schedule" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Choose your event cap</Text>
        <DividerNote>
          Goat roping is usually a youth event and isn't bound by the classification number system - pick
          it instead of a cap if that's what you're posting for.
        </DividerNote>
        <View style={styles.pillRow}>
          <Pill label="Goat Roping" selected={selection?.kind === 'goat'} onPress={() => setSelection({ kind: 'goat' })} />
        </View>
        <Text style={styles.eyebrow}>Or a classification cap</Text>
        <View style={styles.pillWrap}>
          {DIVISION_OPTIONS.map((c) => (
            <Pill
              key={c}
              label={c === OPEN_CAP ? 'Open' : `#${c}`}
              selected={selection?.kind === 'cap' && selection.value === c}
              onPress={() => setSelection({ kind: 'cap', value: c })}
            />
          ))}
        </View>

        <DateField label="Event date" value={eventDate} onChange={setEventDate} minimumDate={new Date()} />
        <TextField label="Event name" value={eventName} onChangeText={setEventName} placeholder="e.g. Fall Qualifier" />
        <TextField label="Producer name" value={producerName} onChangeText={setProducerName} placeholder="e.g. Mathews Land & Cattle" />
        <TextField
          label="Facebook event link (optional)"
          value={facebookLink}
          onChangeText={setFacebookLink}
          placeholder="e.g. https://facebook.com/events/..."
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={styles.label}>Event flier (optional)</Text>
        <Pressable style={styles.dropzone} onPress={() => setFlierOpen(true)}>
          {flierUri ? (
            <>
              <Image source={{ uri: flierUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Flier attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={colors.leather} />
              <Text style={styles.dropzoneText}>Upload the event flier</Text>
              <Text style={styles.dropzoneSub}>Shown to everyone who sees your post</Text>
            </>
          )}
        </Pressable>

        <Button label="Post & show me matches" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} style={{ marginTop: 8 }} />
      </ScrollView>
      <PhotoChooserSheet visible={flierOpen} onClose={() => setFlierOpen(false)} onPicked={handleFlierPicked} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.rust,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.leather,
    marginBottom: 6,
  },
  dropzone: {
    borderWidth: 2,
    borderColor: colors.rope,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  dropzoneImage: { width: '100%', height: 140, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.leather, marginTop: 6 },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', marginTop: 2 },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
