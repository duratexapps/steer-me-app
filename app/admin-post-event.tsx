import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
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
import { DivisionDetailsFields } from '@/src/components/DivisionDetailsFields';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { useCreateAdminEvent, buildDivisionDetailsPayload } from '@/src/hooks/useEvents';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { DIVISION_OPTIONS, OPEN_CAP } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';

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
  // NEW, added 2026-07-29 alongside migration 0039 - same optional
  // multi-day support as create-event.tsx (see that file's matching
  // comment) - real fliers (Super 6 Productions, WSTR Heartland Finale,
  // All Star Team Roping Finals) posted through this exact screen were
  // the first real use of this.
  const [endDate, setEndDate] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [fee, setFee] = useState('');
  // NEW, added 2026-08-17 alongside migration 0054 - see create-event.tsx's
  // matching comment. Most useful right here, since a real flier (Curry
  // County Event Center, JB Wells) is exactly where this info comes from.
  const [bookingLink, setBookingLink] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [divisions, setDivisions] = useState<number[]>([]);
  // NEW, added 2026-07-30 alongside migration 0041 - see create-event.tsx's
  // matching comment.
  const [divisionDetails, setDivisionDetails] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [flierOpen, setFlierOpen] = useState(false);
  const [flierUri, setFlierUri] = useState<string | null>(null);
  const [flierPath, setFlierPath] = useState<string | null>(null);
  // NEW, added 2026-08-09 - see extract-flier-contact-info Edge Function.
  // Always editable, whether it was typed by hand or pre-filled by the
  // scan below - the scan only ever suggests a starting point, never
  // saves anything on its own.
  const [contactInfo, setContactInfo] = useState('');
  const [scanningContact, setScanningContact] = useState(false);
  // NEW, added 2026-08-18 alongside migration 0057 - real ask: a lot of
  // fliers say "enter by text" or "enter by call," with nothing between
  // that and no-online-entry-at-all before now. null = neither (falls
  // back to the plain contact-info note); entryPhone only matters when
  // one of the two is selected. See EventCard.tsx for the entrant side.
  const [entryMethod, setEntryMethod] = useState<'text' | 'call' | null>(null);
  const [entryPhone, setEntryPhone] = useState('');
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
      // NEW, added 2026-08-09 - fires automatically once the upload
      // finishes, since the admin's next real action is filling in the
      // rest of the form anyway - scanning up front means the contact
      // field is usually already suggested by the time they get to it,
      // rather than requiring a separate manual step to remember.
      scanFlierForContactInfo(path);
    } catch {
      showToast('Could not upload flier - try again');
    }
  }

  async function scanFlierForContactInfo(path: string) {
    setScanningContact(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-flier-contact-info', {
        body: { flierPath: path },
      });
      if (error) throw error;
      if (data?.contactInfo) {
        setContactInfo(data.contactInfo);
      } else if (data?.skipped) {
        // AI extraction not configured/unavailable - fail soft, same
        // principle as the Edge Function itself. The admin can still
        // just type the contact info in by hand.
        showToast('Could not auto-read the flier - type contact info in manually.');
      } else {
        showToast('No contact info found on the flier - add it manually if needed.');
      }
    } catch {
      showToast('Could not scan the flier for contact info - type it in manually.');
    } finally {
      setScanningContact(false);
    }
  }

  async function handleSubmit() {
    if (!me) return;
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
      await createAdminEvent.mutateAsync({
        name: name.trim(),
        event_date: date,
        event_end_date: endDate,
        location: location.trim(),
        entry_fee: fee.trim() || 'See listing',
        divisions,
        description: description.trim() || 'No description provided.',
        flier_path: flierPath,
        external_producer_name: producerName.trim(),
        admin_poster_id: me.id,
        division_details: buildDivisionDetailsPayload(divisions, divisionDetails),
        producer_contact_info: contactInfo.trim() || null,
        booking_link: bookingLink.trim() || null,
        booking_phone: bookingPhone.trim() || null,
        entry_method: entryMethod,
        entry_phone: entryMethod ? entryPhone.trim() || null : null,
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
      <ScreenHeader title="Post an Event (Admin)" subtitle="On a producer's behalf - temporary bootstrap tool" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.adminNotice}>
          This event will show as posted by the real producer, with a small note that RopingTools posted it on their
          behalf. Use this only until enough producers are onboarded directly.
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
        <TextField
          label="Venue booking link (optional)"
          value={bookingLink}
          onChangeText={setBookingLink}
          placeholder="e.g. openstalls.com/..."
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextField
          label="Venue booking phone (optional)"
          value={bookingPhone}
          onChangeText={setBookingPhone}
          placeholder="e.g. (555) 123-4567"
          keyboardType="phone-pad"
        />

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

        <DivisionDetailsFields divisions={divisions} details={divisionDetails} onChange={setDivisionDetails} />

        <Text style={styles.label}>Description</Text>
        <Text style={styles.helper}>
          Whole-event details that apply no matter the class or day - venue rules, payback, sponsors, contact
          info, membership requirements. Class-specific details belong above, not here.
        </Text>
        <TextInput
          style={styles.textarea}
          value={description}
          onChangeText={setDescription}
          placeholder="Venue address, payback %, sponsors, contact info, membership rules..."
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

        <Text style={styles.label}>How ropers enter (optional)</Text>
        <Text style={styles.helper}>
          If the flier says "enter by text" or "enter by call," pick it here - Steer Me will pre-fill the
          entrant's own name and classification into their phone's message/call so they don't have to retype it.
          Leave on "Other" if entry is online elsewhere or unclear from the flier.
        </Text>
        <View style={styles.pillWrap}>
          <Pill label="Other / see contact info" selected={entryMethod === null} onPress={() => setEntryMethod(null)} />
          <Pill label="Text to enter" selected={entryMethod === 'text'} onPress={() => setEntryMethod('text')} />
          <Pill label="Call to enter" selected={entryMethod === 'call'} onPress={() => setEntryMethod('call')} />
        </View>
        {entryMethod ? (
          <TextField
            label={entryMethod === 'text' ? 'Number to text' : 'Number to call'}
            value={entryPhone}
            onChangeText={setEntryPhone}
            placeholder="e.g. (432) 349-2572"
            keyboardType="phone-pad"
          />
        ) : null}

        <Text style={[styles.label, { marginTop: entryMethod ? 0 : 16 }]}>Producer contact info</Text>
        <Text style={styles.helper}>
          How an entrant reaches the producer, or extra detail beyond the text/call above -
          {scanningContact ? ' scanning the flier…' : ' auto-suggested from the flier once uploaded. Review and correct before posting.'}
        </Text>
        <View style={styles.contactRow}>
          <TextInput
            style={[styles.textarea, styles.contactInput]}
            value={contactInfo}
            onChangeText={setContactInfo}
            placeholder="e.g. Contact Blake Larmon 918-837-0048"
            placeholderTextColor="#9c8a6b"
            multiline
            numberOfLines={2}
          />
          {flierPath ? (
            <Pressable
              style={styles.rescanBtn}
              onPress={() => scanFlierForContactInfo(flierPath)}
              disabled={scanningContact}
            >
              <Ionicons name="scan-outline" size={14} color={colors.espresso} />
              <Text style={styles.rescanBtnText}>{scanningContact ? 'Scanning…' : 'Re-scan flier'}</Text>
            </Pressable>
          ) : null}
        </View>

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
  contactRow: { marginBottom: 16 },
  contactInput: { minHeight: 50, marginBottom: 8 },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  rescanBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.espresso },
});
