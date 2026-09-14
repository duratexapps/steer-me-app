import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
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
import { useProducerIdentityMatches, useMyProducerIdentity, type ProducerIdentityMatch } from '@/src/hooks/useProducerIdentity';
import { goBackOrHome } from '@/src/lib/navigation';

// Mirrors Screen 12 (#producer) - sign-up form when no producer profile
// exists yet, dashboard once it does.
export default function Producer() {
  const profileStatusChecked = useSessionStore((s) => s.profileStatusChecked);
  const hasProducerProfile = useSessionStore((s) => s.hasProducerProfile);
  const setHasProducerProfile = useSessionStore((s) => s.setHasProducerProfile);
  const { data: producer, isLoading } = useMyProducerProfile();
  const invalidateProducer = useInvalidateProducerProfile();

  // hasProducerProfile flips true at session bootstrap, slightly before
  // useMyProducerProfile's own fetch resolves - without this guard, that
  // gap briefly flashes the sign-up form for a producer who already exists.
  // !profileStatusChecked covers the earlier cold-start gap - see
  // app/(tabs)/index.tsx's matching guard comment.
  if (!profileStatusChecked || (hasProducerProfile && isLoading)) {
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const [docUri, setDocUri] = useState<string | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimedMatch, setClaimedMatch] = useState<ProducerIdentityMatch | null>(null);
  const [dismissedMatches, setDismissedMatches] = useState(false);

  // Only searches once claimedMatch/dismissedMatches aren't already
  // decided - once a producer has picked "this is me" or "not me" there's
  // no reason to keep re-querying while they finish the rest of the form.
  const searchActive = !claimedMatch && !dismissedMatches;
  const { data: matches } = useProducerIdentityMatches(searchActive ? orgName : '');

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
    const { error } = await supabase.rpc('create_producer_profile', {
      p_org_name: orgName.trim(),
      p_contact_name: contactName.trim() || null,
      p_contact_info: contactInfo.trim() || null,
      p_affiliation: affiliation.trim() || null,
      p_verification_doc_path: docPath,
      p_claim_identity_id: claimedMatch?.id ?? null,
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
      <ScreenHeader title="Producer Tools" subtitle="Set up a producer profile to list your own events" onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
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

        <TextField
          label="Organization name"
          value={orgName}
          onChangeText={(v) => {
            setOrgName(v);
            setClaimedMatch(null);
            setDismissedMatches(false);
          }}
          placeholder="e.g. Mathews Land & Cattle Xtreme Team Roping"
        />

        {claimedMatch ? (
          <View style={styles.claimCard}>
            <Text style={styles.claimTitle}>✓ Claiming {claimedMatch.org_name}</Text>
            <Text style={styles.claimSub}>
              {claimedMatch.event_count} event{claimedMatch.event_count === 1 ? '' : 's'} already on Steer Me
              {claimedMatch.rating_count > 0 ? ` · ${claimedMatch.rating_count} rating${claimedMatch.rating_count === 1 ? '' : 's'}` : ''}
              {' '}will carry over to your account.
            </Text>
            <Pressable onPress={() => setClaimedMatch(null)}>
              <Text style={styles.claimUndo}>Not right - undo</Text>
            </Pressable>
          </View>
        ) : matches && matches.length > 0 && !dismissedMatches ? (
          <View style={styles.matchWrap}>
            <Text style={styles.matchHeader}>
              We found existing Steer Me listings under this name - is one of these you?
            </Text>
            {matches.map((m) => (
              <Pressable key={m.id} style={styles.matchRow} onPress={() => setClaimedMatch(m)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchName}>{m.org_name}</Text>
                  <Text style={styles.matchMeta}>
                    {m.event_count} event{m.event_count === 1 ? '' : 's'}
                    {m.rating_count > 0 ? ` · ★ ${m.avg_stars ?? '—'} (${m.rating_count})` : ''}
                  </Text>
                </View>
                <Text style={styles.matchClaimText}>This is me</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setDismissedMatches(true)}>
              <Text style={styles.matchNoneLink}>None of these are me</Text>
            </Pressable>
          </View>
        ) : null}

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
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="producer" />
    </SafeAreaView>
  );
}

function ProducerDashboard({ producer }: { producer: { org_name: string; verification_status: string } }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: events, isLoading: eventsLoading } = useMyEvents();
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: counts } = useAttendanceCounts(eventIds);
  const { data: identity } = useMyProducerIdentity();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Producer Tools" subtitle={`Managing events for ${producer.org_name}`} onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {producer.verification_status !== 'verified' ? (
          <DividerNote>
            Pending verification - your events are visible only to you until our team verifies your
            producer profile.
          </DividerNote>
        ) : null}
        {identity ? (
          <View style={styles.ratingBanner}>
            <Text style={styles.ratingNum}>{identity.avg_stars != null ? `★${identity.avg_stars}` : '—'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.ratingLabel}>Your reputation on Steer Me</Text>
              <Text style={styles.ratingSub}>
                {identity.rating_count > 0
                  ? `${identity.rating_count} rating${identity.rating_count === 1 ? '' : 's'} across ${identity.event_count} event${identity.event_count === 1 ? '' : 's'}${identity.avg_stars == null ? ' - not enough yet to show a score' : ''}`
                  : `No ratings yet across ${identity.event_count} event${identity.event_count === 1 ? '' : 's'} - this carries forward as you post more`}
              </Text>
            </View>
          </View>
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
          events.map((e) => (
            <EventCard
              key={e.id}
              // producer_avg_stars/rating_count suppressed here (null/0) -
              // the dashboard already shows this producer's own rating
              // once, in the banner above; repeating it on every one of
              // their own event cards would be redundant.
              event={{ ...e, producer_org_name: producer.org_name, producer_avg_stars: null, producer_rating_count: 0 }}
              counts={counts}
              producerView
            />
          ))
        )}
      </ScrollView>
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="producer" />
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
  matchWrap: { marginTop: -8, marginBottom: 16 },
  matchHeader: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle, marginBottom: 8, lineHeight: 16 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
  },
  matchName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.espresso },
  matchMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 1 },
  matchClaimText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass },
  matchNoneLink: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, textDecorationLine: 'underline', textAlign: 'center' },
  claimCard: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 12,
    marginTop: -8,
    marginBottom: 16,
  },
  claimTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.espresso },
  claimSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.espresso, marginTop: 2, lineHeight: 15 },
  claimUndo: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.saddle, textDecorationLine: 'underline', marginTop: 6 },
  ratingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 16,
  },
  ratingNum: { fontFamily: fonts.mono, fontSize: 20, color: colors.brass },
  ratingLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.espresso },
  ratingSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 1 },
});
