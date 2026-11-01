import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { AutocompleteField } from '@/src/components/ui/AutocompleteField';
import { DateField } from '@/src/components/ui/DateField';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { useCreateUserPractice } from '@/src/hooks/useEvents';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';

// Any member with a finished profile can post a practice (migration 0125) - no producer, instructor or business
// sign-up. The database function does the real checking and returns plain-language messages, so the screen only
// has to collect the fields and show whatever it says. A practice shows only under the Practices chip on Events.
export default function PostPractice() {
  const createPractice = useCreateUserPractice();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [location, setLocation] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [weekly, setWeekly] = useState(false);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [contact, setContact] = useState('');
  const [entryMethod, setEntryMethod] = useState<'text' | 'call' | null>(null);
  const [entryPhone, setEntryPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The host name starts as the member's own name; they can change it to the arena or series name.
  const hostValue = host || profile?.full_name || '';

  async function handleSubmit() {
    if (!name.trim() || !hostValue.trim() || !location.trim() || !date || !time.trim() || !cost.trim()) {
      showToast('Fill in the name, host, town, date, time and cost');
      return;
    }
    if (weekly && !endDate) {
      showToast('Pick the last date of the weekly practice');
      return;
    }
    if (weekly && endDate && date && endDate < date) {
      showToast('The last date must be after the first date');
      return;
    }
    setSubmitting(true);
    try {
      await createPractice.mutateAsync({
        name: name.trim(),
        host: hostValue.trim(),
        location: location.trim(),
        venueAddress: venueAddress.trim(),
        date,
        weekly,
        endDate,
        time: time.trim(),
        cost: cost.trim(),
        notes: notes.trim(),
        contact: contact.trim(),
        entryMethod,
        entryPhone: entryPhone.trim(),
      });
      showToast(`"${name.trim()}" posted. Find it under Practices on Events.`);
      goBackOrHome();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post the practice');
    } finally {
      setSubmitting(false);
    }
  }

  const needsProfile = !profileLoading && !profile;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Post a Practice" subtitle="Free for any member. Shows under Practices on Events" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {needsProfile ? (
          <Text style={styles.notice}>Finish your roper profile first, then come back to post a practice.</Text>
        ) : null}
        <Text style={styles.notice}>
          Everything you enter here, including the address and any phone number, is visible to all Steer Me members. Only post a
          practice you are hosting or have the host's okay to share. Steer Me does not verify or endorse practices.
        </Text>

        <TextField label="Practice name" value={name} onChangeText={setName} placeholder="e.g. Tuesday Night Practice" />
        <TextField label="Host" value={hostValue} onChangeText={setHost} placeholder="Your name, or the arena or group hosting" />
        <AutocompleteField label="Town" value={location} onChange={setLocation} placeholder="e.g. Wickenburg, AZ" required />
        <TextField
          label="Address or arena name (optional)"
          value={venueAddress}
          onChangeText={setVenueAddress}
          placeholder="e.g. Sample Arena, 123 Rope Rd"
        />

        <DateField label={weekly ? 'First date' : 'Date'} value={date} onChange={setDate} minimumDate={new Date()} />
        <ToggleRow
          title="Repeats every week"
          description="Same day and time each week. Pick the last date and it stays listed until then."
          value={weekly}
          onToggle={() => setWeekly((v) => !v)}
        />
        {weekly ? (
          <DateField label="Last date" value={endDate} onChange={setEndDate} minimumDate={date ? new Date(`${date}T00:00:00`) : new Date()} />
        ) : null}

        <TextField label="Time" value={time} onChangeText={setTime} placeholder="e.g. 6:00 to 8:00 PM" />
        <TextField label="Cost" value={cost} onChangeText={setCost} placeholder="e.g. $25 per roper, or Free" />

        <Text style={styles.label}>Anything else (optional)</Text>
        <TextInput
          style={styles.textarea}
          value={notes}
          onChangeText={setNotes}
          placeholder="Steers or dummies, who it's for, what to bring..."
          placeholderTextColor="#9c8a6b"
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        <TextField label="Contact (optional)" value={contact} onChangeText={setContact} placeholder="e.g. Dusty, 903-555-0100" />
        <Text style={styles.label}>Text or call button (optional)</Text>
        <Text style={styles.helper}>Adds a Text the Host or Call the Host button to your listing.</Text>
        <View style={styles.pillWrap}>
          <Pill label="No button" selected={entryMethod === null} onPress={() => setEntryMethod(null)} />
          <Pill label="Text the Host" selected={entryMethod === 'text'} onPress={() => setEntryMethod('text')} />
          <Pill label="Call the Host" selected={entryMethod === 'call'} onPress={() => setEntryMethod('call')} />
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

        <Button label="Post practice" onPress={handleSubmit} loading={submitting} style={{ marginTop: 8 }} />
        <Text style={styles.helper}>You can have 3 practices listed at a time, and take one down from its card.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  notice: { fontFamily: fonts.body, fontSize: 12.5, color: colors.espresso, lineHeight: 17, marginBottom: 14 },
  helper: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 10, marginTop: 4, lineHeight: 16 },
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
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
});
