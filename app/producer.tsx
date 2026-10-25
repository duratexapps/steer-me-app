import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
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
import { Pill } from '@/src/components/ui/Pill';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProducerProfile, useInvalidateProducerProfile } from '@/src/hooks/useProducerProfile';
import { useMyEvents, useAttendanceCounts } from '@/src/hooks/useEvents';
import { useMyLayoverListings } from '@/src/hooks/useLayoverListings';
import { FeatureNowButton } from '@/src/components/FeaturedOption';
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
  // An instructor who teaches clinics or schools signs up through the same flow (migration 0107). They arrive here
  // from the "I teach clinics or schools" choice (kind=clinician) or pick it with the pills below.
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const [clinician, setClinician] = useState(kind === 'clinician');
  const [lodging, setLodging] = useState(kind === 'lodging');
  const pick = (k: 'producer' | 'clinician' | 'lodging') => { setClinician(k === 'clinician'); setLodging(k === 'lodging'); };
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
  const { data: matches } = useProducerIdentityMatches(searchActive && !clinician && !lodging ? orgName : '');

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
      p_is_clinician: clinician,
      p_is_lodging: lodging,
    });
    setSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }
    showToast(`${lodging ? 'Layover and hotel' : clinician ? 'Clinic and school' : 'Producer'} profile submitted for ${orgName.trim()} - pending verification`);
    onCreated();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title={lodging ? 'Layover & Hotel Tools' : clinician ? 'Clinic & School Tools' : 'Producer Tools'}
        subtitle={lodging ? 'Set up a profile to list your layover spot or hotel' : clinician ? 'Set up a profile to list your clinics and schools' : 'Set up a producer profile to list your own events'}
        onBack={() => goBackOrHome()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>I am setting up</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Pill label="A producer (ropings)" selected={!clinician && !lodging} onPress={() => pick('producer')} />
          <Pill label="An instructor (clinics & schools)" selected={clinician} onPress={() => pick('clinician')} />
          <Pill label="A layover spot or hotel" selected={lodging} onPress={() => pick('lodging')} />
        </View>
        {lodging ? (
          <>
            <DividerNote>
              Layover and hotel accounts are separate from your athlete profile - you can hold both. Ropers on
              the road use the Layover Finder to find a place for their horses and rig. Your listing appears there
              after a quick verification, and nothing you post is public until then.
            </DividerNote>
            <DividerNote>
              <Text style={{ fontFamily: fonts.bodyBold }}>Pricing: </Text>
              free to create a profile and list your spot. An optional paid Featured placement puts your listing first.
            </DividerNote>
          </>
        ) : clinician ? (
          <>
            <DividerNote>
              Instructor accounts are separate from your athlete profile - you can hold both. Your clinics and
              schools are listed under Clinics & schools after a quick verification, and nothing you post is
              public until then.
            </DividerNote>
            <DividerNote>
              <Text style={{ fontFamily: fonts.bodyBold }}>Pricing: </Text>
              free to create a profile and list your clinics and schools.
            </DividerNote>
          </>
        ) : (
          <>
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
          </>
        )}

        <TextField
          label={lodging ? 'Business name' : clinician ? 'Clinic or school name (or your name)' : 'Organization name'}
          value={orgName}
          onChangeText={(v) => {
            setOrgName(v);
            setClaimedMatch(null);
            setDismissedMatches(false);
          }}
          placeholder={lodging ? 'e.g. Sagebrush Horse Hotel' : clinician ? 'e.g. Jane Doe Roping School' : 'e.g. Mathews Land & Cattle Xtreme Team Roping'}
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

        <TextField label="Contact name" value={contactName} onChangeText={setContactName} placeholder={lodging || clinician ? 'e.g. your name' : 'e.g. Mathews office contact'} />
        <TextField label="Contact phone or email" value={contactInfo} onChangeText={setContactInfo} placeholder={lodging || clinician ? 'e.g. (555) 123-4567 or you@example.com' : 'e.g. events@example.com'} />
        <TextField label={lodging ? 'Anything else we should know (if any)' : clinician ? 'Credentials or affiliation (if any)' : 'Affiliation (if any)'} value={affiliation} onChangeText={setAffiliation} placeholder={lodging ? 'e.g. family-run since 1998' : clinician ? 'e.g. NFR qualifier, retired pro, independent' : 'e.g. WSTR-sanctioned, USTRC-sanctioned, independent'} />

        <Text style={styles.label}>
          {lodging ? 'Proof you run this place' : clinician ? 'Proof you teach clinics or schools' : 'Proof of producer status'} <Text style={styles.required}>*required</Text>
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
                {lodging
                  ? 'Upload a photo of your sign or a screenshot of your website, business listing or booking page'
                  : clinician
                  ? 'Upload a flier from a past clinic, a screenshot of your website or social page, or a letter from a sponsor or association'
                  : 'Upload a business license, insurance certificate, or sanctioning-body affiliation letter'}
              </Text>
              <Text style={styles.dropzoneSub}>{lodging ? 'Reviewed before your listing goes public' : clinician ? 'Reviewed before your clinics go public' : 'Reviewed before your events go public'}</Text>
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

function ProducerDashboard({ producer }: { producer: { org_name: string; verification_status: string; is_clinician?: boolean; is_lodging?: boolean } }) {
  if (producer.is_lodging) return <LodgingDashboard producer={producer} />;
  const clinician = !!producer.is_clinician;
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: events, isLoading: eventsLoading } = useMyEvents();
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: counts } = useAttendanceCounts(eventIds);
  const { data: identity } = useMyProducerIdentity();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title={clinician ? 'Clinic & School Tools' : 'Producer Tools'} subtitle={clinician ? `Managing clinics and schools for ${producer.org_name}` : `Managing events for ${producer.org_name}`} onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {producer.verification_status !== 'verified' ? (
          <DividerNote>
            {clinician
              ? 'Pending verification - your clinics and schools are visible only to you until our team verifies your profile.'
              : 'Pending verification - your events are visible only to you until our team verifies your producer profile.'}
          </DividerNote>
        ) : null}
        {identity && !clinician ? (
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
        {!clinician ? (
          <DividerNote>
            Ropers who find their own partner through this app both show up ready to pay their own entry
            fee - unlike a producer draw, where the drawn partner isn't obligated to pay. Pairs who connect
            here bring you two paid entries, not one paid and one owed.
          </DividerNote>
        ) : null}

        <Button label={clinician ? '+ Post a clinic or school' : '+ Create an event'} onPress={() => router.push('/create-event')} style={{ marginBottom: 20 }} />

        <Text style={styles.eyebrow}>{clinician ? 'Your clinics and schools' : 'Your events'}</Text>
        {eventsLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 12 }} />
        ) : !events || events.length === 0 ? (
          <DividerNote>{clinician ? 'No clinics or schools posted yet. Post your first one above.' : 'No events posted yet. Create your first one above.'}</DividerNote>
        ) : (
          events.map((e) => (
            <View key={e.id}>
            <EventCard
              // producer_avg_stars/rating_count suppressed here (null/0) -
              // the dashboard already shows this producer's own rating
              // once, in the banner above; repeating it on every one of
              // their own event cards would be redundant.
              event={{ ...e, producer_org_name: producer.org_name, producer_avg_stars: null, producer_rating_count: 0 }}
              counts={counts}
              producerView
            />
            {clinician ? <FeatureNowButton target="event" id={e.id} featuredUntil={e.featured_until ?? null} /> : null}
            </View>
          ))
        )}
      </ScrollView>
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="producer" />
    </SafeAreaView>
  );
}

const KIND_NAME: Record<string, string> = {
  fairgrounds: 'Fairgrounds', equestrian_center: 'Equestrian center', boarding_barn: 'Horse motel / barn', arena: 'Arena', campground: 'RV park with horses', hotel: 'Hotel',
};
const STATUS_NOTE: Record<string, string> = {
  pending: 'Waiting for our review - not public yet',
  approved: 'Live in the Layover Finder',
  rejected: 'Not approved - email ropingtools@duratex-ie.com with questions',
};

function LodgingDashboard({ producer }: { producer: { org_name: string; verification_status: string } }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: listings, isLoading } = useMyLayoverListings();
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Layover & Hotel Tools" subtitle={`Managing listings for ${producer.org_name}`} onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {producer.verification_status !== 'verified' ? (
          <DividerNote>Pending verification - your listings stay private until our team verifies your profile and approves each listing.</DividerNote>
        ) : null}
        <Button label="+ List a layover spot or hotel" onPress={() => router.push('/create-layover')} style={{ marginBottom: 20 }} />
        <Text style={styles.eyebrow}>Your listings</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 12 }} />
        ) : !listings || listings.length === 0 ? (
          <DividerNote>No listings yet. Add your first one above.</DividerNote>
        ) : (
          listings.map((l) => (
            <View key={l.id} style={styles.listing}>
              <Text style={styles.listingName}>{l.name}</Text>
              <Text style={styles.listingMeta}>{KIND_NAME[l.kind] ?? l.kind} · {l.city}, {l.state}</Text>
              <Text style={styles.listingStatus}>{STATUS_NOTE[l.review_status]}</Text>
              {l.review_status === 'approved' ? <FeatureNowButton target="layover_spot" id={l.id} featuredUntil={l.featured_until} /> : null}
            </View>
          ))
        )}
      </ScrollView>
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="producer" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listing: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
  },
  listingName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  listingMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginTop: 2 },
  listingStatus: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass, marginTop: 6, marginBottom: 8 },
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
