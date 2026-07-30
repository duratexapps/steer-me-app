import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { AutocompleteField } from '@/src/components/ui/AutocompleteField';
import { DateField } from '@/src/components/ui/DateField';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile, publicUrlFor } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { useEventById, useUpdateAdminEvent } from '@/src/hooks/useEvents';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';

// NEW, added 2026-07-29 - real gap flagged directly by the user: nobody,
// not even an admin, had any way to fix a typo or attach a flier to an
// event that already exists (Create only ever inserted, nothing ever
// updated). Scoped by direct instruction to ADMIN-POSTED events only,
// matching the existing events_update_admin RLS policy (migration 0038) -
// this deliberately does NOT let an admin edit a real producer's own
// listing or a Draw-Pro-synced one. The entry point is a per-event "Edit"
// link on EventCard, visible only when both the viewer is an admin AND
// the event itself is posted_by_admin - see EventCard.tsx.
export default function AdminEditEvent() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const { data: me } = useMyProfile();
  const { data: event, isLoading: eventLoading } = useEventById(eventId);
  const updateAdminEvent = useUpdateAdminEvent();

  const [producerName, setProducerName] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState('');
  const [divisions, setDivisions] = useState<number[]>([]);
  const [description, setDescription] = useState('');
  const [flierOpen, setFlierOpen] = useState(false);
  const [flierUri, setFlierUri] = useState<string | null>(null);
  const [flierPath, setFlierPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill once, the first time the event actually loads - a naive
  // "always sync from event" effect would stomp on in-progress edits
  // every time this query happens to refetch (e.g. after the mutation's
  // own onSuccess invalidation).
  useEffect(() => {
    if (event && !prefilled) {
      setProducerName(event.external_producer_name ?? '');
      setName(event.name);
      setDate(event.event_date);
      setEndDate(event.event_end_date);
      setLocation(event.location);
      setFee(event.entry_fee ?? '');
      setDivisions(event.divisions);
      setDescription(event.description ?? '');
      setFlierPath(event.flier_path);
      setFlierUri(publicUrlFor('event-fliers', event.flier_path));
      setPrefilled(true);
    }
  }, [event, prefilled]);

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
    if (!eventId) return;
    if (!producerName.trim() || !name.trim() || !date || !location.trim() || divisions.length === 0) {
      showToast('Fill in producer name, event name, date, location, and at least one division');
      return;
    }
    if (endDate && endDate < date) {
      showToast('End date must be on or after the start date');
      return;
    }

    setSubmitting(true);
    try {
      await updateAdminEvent.mutateAsync({
        eventId,
        name: name.trim(),
        event_date: date,
        event_end_date: endDate,
        location: location.trim(),
        entry_fee: fee.trim() || 'See listing',
        divisions,
        description: description.trim() || 'No description provided.',
        flier_path: flierPath,
        external_producer_name: producerName.trim(),
      });
      showToast(`"${name.trim()}" updated`);
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update event');
    } finally {
      setSubmitting(false);
    }
  }

  // Gates, checked client-side for UX - the REAL enforcement is server-side
  // via RLS (events_update_admin requires both is_admin = true AND
  // posted_by_admin = true on the target row regardless of what this
  // screen shows).
  if (me && !me.is_admin) {
    router.back();
    return null;
  }
  if (event && !event.posted_by_admin) {
    showToast('Only admin-posted events can be edited here');
    router.back();
    return null;
  }

  if (eventLoading || !prefilled) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Edit Event (Admin)" onBack={() => router.back()} />
        <ActivityIndicator color={colors.brass} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Edit Event (Admin)" subtitle="Fix a typo, swap the flier, or update details" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.adminNotice}>
          Editing this event updates the live listing immediately - it's still shown as posted by the real producer,
          with a note that RopingTools posted it on their behalf.
        </Text>

        <TextField label="Producer name" value={producerName} onChangeText={setProducerName} placeholder="e.g. Circle T Ropings" />
        <TextField label="Event name" value={name} onChangeText={setName} placeholder="e.g. Fall Qualifier" />
        <DateField label={endDate ? 'Start date' : 'Date'} value={date} onChange={setDate} minimumDate={new Date()} />

        <ToggleRow
          title="Runs multiple days"
          description="Turn on for a Fri-Sun roping or similar - off means a single-day event"
          value={endDate !== null}
          onToggle={() => setEndDate(endDate === null ? date ?? null : null)}
        />
        {endDate !== null ? (
          <DateField label="End date" value={endDate} onChange={setEndDate} minimumDate={date ? new Date(`${date}T00:00:00`) : new Date()} />
        ) : null}

        <AutocompleteField label="Location" value={location} onChange={setLocation} placeholder="e.g. Wickenburg, AZ" required />
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
              <Text style={styles.dropzoneDone}>✓ Flier attached - tap to replace</Text>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Upload the flier</Text>
              <Text style={styles.dropzoneSub}>Shown to everyone browsing Events</Text>
            </>
          )}
        </Pressable>

        <Button label="Save changes" onPress={handleSubmit} loading={submitting} style={{ marginTop: 8 }} />
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
