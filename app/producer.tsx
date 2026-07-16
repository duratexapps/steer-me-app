import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { EventCard } from '@/src/components/EventCard';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProducerProfile, useInvalidateProducerProfile } from '@/src/hooks/useProducerProfile';
import { useMyEvents, useAttendanceCounts } from '@/src/hooks/useEvents';

// Mirrors Screen 12 (#producer) - sign-up form when no producer profile
// exists yet, dashboard once it does.
export default function Producer() {
  const hasProducerProfile = useSessionStore((s) => s.hasProducerProfile);
  const setHasProducerProfile = useSessionStore((s) => s.setHasProducerProfile);
  const { data: producer, isLoading } = useMyProducerProfile();
  const invalidateProducer = useInvalidateProducerProfile();

  // hasProducerProfile flips true at session bootstrap, slightly before
  // useMyProducerProfile's own fetch resolves - without this guard, that
  // gap briefly flashes the sign-up form for a producer who already exists.
  if (hasProducerProfile && isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ActivityIndicator color={colors.brass} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (producer) {
    return <ProducerDashboard producer={producer} />;
  }

  return <ProducerSignUp onCreated={() => { setHasProducerProfile(true); invalidateProducer(); }} />;
}

function ProducerSignUp({ onCreated }: { onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const [docUri, setDocUri] = useState<string | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setDocUri(image.uri);
    try {
      const path = await uploadUserFile('producer-docs', user.id, image, 'verification-doc');
      setDocPath(path);
    } catch {
      showToast('Could not upload document - try again');
    }
  }

  const canSubmit = orgName.trim().length > 0 && !!docPath;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { error } = await supabase.from('producer_profiles').insert({
      org_name: orgName.trim(),
      contact_name: contactName.trim() || null,
      contact_info: contactInfo.trim() || null,
      affiliation: affiliation.trim() || null,
      verification_doc_path: docPath,
    });
    setSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }
    showToast(`Producer profile submitted for ${orgName.trim()} - pending verification`);
    onCreated();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Producer Tools" subtitle="Set up a producer profile to list your own events" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <DividerNote>
          Producer accounts are separate from your athlete profile - you can hold both. Producer listings
          go through their own verification and are subject to separate Producer Guidelines covering
          accurate event details and no fraudulent listings.
        </DividerNote>
        <DividerNote>
          <Text style={{ fontFamily: fonts.bodyBold }}>Pricing: </Text>
          free to create a producer profile and list events. Once in-app entry-fee payment is available,
          Steer Me takes 4% + $1.50 per paid registration - nothing until you collect a payment.
        </DividerNote>

        <TextField label="Organization name" value={orgName} onChangeText={setOrgName} placeholder="e.g. Mathews Land & Cattle Xtreme Team Roping" />
        <TextField label="Contact name" value={contactName} onChangeText={setContactName} placeholder="e.g. Mathews office contact" />
        <TextField label="Contact phone or email" value={contactInfo} onChangeText={setContactInfo} placeholder="e.g. events@example.com" />
        <TextField label="Affiliation (if any)" value={affiliation} onChangeText={setAffiliation} placeholder="e.g. WSTR-sanctioned, USTRC-sanctioned, independent" />

        <Text style={styles.label}>
          Proof of producer status <Text style={styles.required}>*required</Text>
        </Text>
        <Pressable style={styles.dropzone} onPress={() => setDocOpen(true)}>
          {docUri ? (
            <>
              <Image source={{ uri: docUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Document attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="document-text-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>
                Upload a business license, insurance certificate, or sanctioning-body affiliation letter
              </Text>
              <Text style={styles.dropzoneSub}>Reviewed before your events go public</Text>
            </>
          )}
        </Pressable>

        <Button label="Submit for verification" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} style={{ marginTop: 16 }} />
      </ScrollView>
      <PhotoChooserSheet visible={docOpen} onClose={() => setDocOpen(false)} onPicked={handlePicked} />
    </SafeAreaView>
  );
}

function ProducerDashboard({ producer }: { producer: { org_name: string; verification_status: string } }) {
  const { data: events, isLoading: eventsLoading } = useMyEvents();
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: counts } = useAttendanceCounts(eventIds);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Producer Tools" subtitle={`Managing events for ${producer.org_name}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {producer.verification_status !== 'verified' ? (
          <DividerNote>
            Pending verification - your events are visible only to you until our team verifies your
            producer profile.
          </DividerNote>
        ) : null}
        <DividerNote>
          Ropers who find their own partner through this app both show up ready to pay their own entry
          fee - unlike a producer draw, where the drawn partner isn't obligated to pay. Pairs who connect
          here bring you two paid entries, not one paid and one owed.
        </DividerNote>

        <Button label="+ Create an event" onPress={() => router.push('/create-event')} style={{ marginBottom: 20 }} />

        <Text style={styles.eyebrow}>Your events</Text>
        {eventsLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 12 }} />
        ) : !events || events.length === 0 ? (
          <DividerNote>No events posted yet. Create your first one above.</DividerNote>
        ) : (
          events.map((e) => <EventCard key={e.id} event={{ ...e, producer_org_name: producer.org_name }} counts={counts} producerView />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  required: { color: colors.brass, textTransform: 'none' },
  dropzone: {
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 6,
  },
  dropzoneImage: { width: '100%', height: 130, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6, textAlign: 'center' },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2, textAlign: 'center' },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
