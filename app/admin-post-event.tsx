import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { useCreateAdminEvent } from '@/src/hooks/useEvents';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

// ============================================================
// TEMPORARY/REMOVABLE FEATURE - see migration 0038_admin_posted_events.sql
// for the full reasoning (Steer Me/Draw Pro's cold-start chicken-and-egg
// problem: contestants need events to browse, producers need contestants
// before they have a reason to sign up themselves). Gated to is_admin
// accounts only - see the redirect-away check in the component body.
//
// To remove this feature entirely later: delete this file, remove the
// nav entry point wherever it ends up living (Profile screen, most
// likely), and optionally revoke is_admin from whatever accounts have
// it. The database side (posted_by_admin, admin_poster_id, is_admin
// columns and their RLS policies) is harmless left in place - nothing
// depends on this screen existing to function correctly, it only ever
// matters for rows this screen itself created.
// ============================================================
export default function AdminPostEvent() {
  const { data: me } = useMyProfile();
  const createAdminEvent = useCreateAdminEvent();

  const [producerName, setProducerName] = useState('');
  const [name, setName] = useState('');
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
      const path = await uploadUserFile('event-fliers', user.id, image, `admin-flier-${Date.now()}`);
      setFlierPath(path);
    } catch {
      showToast('Could not upload flier - try again');
    }
  }

  async function handleSubmit() {
    if (!me) return;
    if (!producerName.trim() || !name.trim() || !date || !location.trim() || divisions.length === 0) {
      showToast('Fill in producer name, event name, date, location, and at least one division');
      return;
    }

    setSubmitting(true);
    try {
      await createAdminEvent.mutateAsync({
        name: name.trim(),
        event_date: date,
        location: location.trim(),
        entry_fee: fee.trim() || 'See listing',
        divisions,
        description: description.trim() || 'No description provided.',
        flier_path: flierPath,
        external_producer_name: producerName.trim(),
        admin_poster_id: me.id,
      });
      showToast(`"${name.trim()}" posted on behalf of ${producerName.trim()}`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post event');
    } finally {
      setSubmitting(false);
    }
  }

  // Gate: redirect away entirely if this account isn't an admin. Checked
  // client-side for UX (don't show a form someone can't actually submit);
  // the REAL enforcement is server-side via RLS (events_insert_admin
  // policy in migration 0038 - insert fails regardless of what this
  // screen shows if is_admin isn't actually true on the caller's row).
  if (me && !me.is_admin) {
    router.back();
    return null;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post an Event (Admin)" subtitle="On a producer's behalf - temporary bootstrap tool" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.adminNotice}>
          This event will show as posted by the real producer, with a small note that RopingTools posted it on their
          behalf. Use this only until enough producers are onboarded directly.
        </Text>

        <TextField label="Producer name" value={producerName} onChangeText={setProducerName} placeholder="e.g. Circle T Ropings" />
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
        <Text style={styles.helper}>Tap every class listed on the flier - at least one required.</Text>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textarea}
          value={description}
          onChangeText={setDescription}
          placeholder="Details from the flier - cattle, added money, format..."
          placeholderTextColor="#9c8a6b"
          multiline
          numberOfLines={4}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>Event flier</Text>
        <Pressable style={styles.dropzone} onPress={() => setFlierOpen(true)}>
          {flierUri ? (
            <>
              <Image source={{ uri: flierUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Flier attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Upload the flier</Text>
              <Text style={styles.dropzoneSub}>Shown to everyone browsing Events</Text>
            </>
          )}
        </Pressable>

        <Button label="Post event" onPress={handleSubmit} loading={submitting} style={{ marginTop: 8 }} />
      </ScrollView>
      <PhotoChooserSheet visible={flierOpen} onClose={() => setFlierOpen(false)} onPicked={handleFlierPicked} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  adminNotice: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.saddle,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 16,
    lineHeight: 16,
  },
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
