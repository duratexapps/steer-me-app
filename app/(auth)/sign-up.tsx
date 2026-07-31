import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { AutocompleteField } from '@/src/components/ui/AutocompleteField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { validateClassificationForEnd, type Position } from '@/src/lib/matching';
import { friendlySupabaseError } from '@/src/lib/errors';
import { verifyClassificationCard } from '@/src/lib/verification';

type PhotoTarget = 'avatar' | 'screenshot' | null;

// Mirrors Screen 1 (#signup). The prototype fakes OCR on the Global
// Handicap screenshot (auto-fills membership ID/classification after a
// staged setTimeout "scan"). Per the confirmed v1 decision, this is manual
// entry instead - the screenshot is stored as supporting evidence, not fed
// through a vision API.
export default function SignUp() {
  const setHasAthleteProfile = useSessionStore((s) => s.setHasAthleteProfile);

  const [photoTarget, setPhotoTarget] = useState<PhotoTarget>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [globalMembershipId, setGlobalMembershipId] = useState('');
  const [classification, setClassification] = useState('');
  // Real bug fix 2026-07-25 (see migration 0030): a Switch Ender ropes
  // both ends, and header/heeler ratings are assessed independently and
  // commonly differ - one generic "classification" field can't represent
  // that. These two only apply when position === 'Switch'; Header/Heeler
  // ropers keep using the single `classification` field above, unchanged.
  const [headerClassification, setHeaderClassification] = useState('');
  const [heelerClassification, setHeelerClassification] = useState('');

  const [position, setPosition] = useState<Position>('Heeler');
  const [homeArea, setHomeArea] = useState('');
  const [contact, setContact] = useState('');
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // NEW, added 2026-07-27 - "refer a friend." Optional, manually-typed
  // (see migration 0034's file header for why this isn't a tap-through
  // deep link yet - no real app-store/domain presence to link to today).
  const [referralCode, setReferralCode] = useState('');

  async function handlePicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (photoTarget === 'avatar') {
      setAvatarUri(image.uri);
      try {
        const path = await uploadUserFile('avatars', user.id, image, 'avatar');
        setAvatarPath(path);
      } catch (err) {
        showToast('Could not upload photo - try again');
      }
    } else if (photoTarget === 'screenshot') {
      setScreenshotUri(image.uri);
      try {
        const path = await uploadUserFile('verification-screenshots', user.id, image, 'global-handicap');
        setScreenshotPath(path);
      } catch (err) {
        showToast('Could not upload screenshot - try again');
      }
    }
  }

  const classificationNumber = parseFloat(classification);
  const headerClassificationNumber = parseFloat(headerClassification);
  const heelerClassificationNumber = parseFloat(heelerClassification);

  // For Header/Heeler, the single field must be a valid number for THAT
  // end specifically (e.g. a Header can't enter 9.5, since headers max
  // out at 9) - real validation that never existed before this fix,
  // despite MAX_HEADER_NUMBER/MAX_HEELER_NUMBER already being defined.
  // For Switch, BOTH numbers are required, each validated against its
  // own end's real range.
  const classificationValid =
    position === 'Switch'
      ? !Number.isNaN(headerClassificationNumber) &&
        !validateClassificationForEnd(headerClassificationNumber, 'header') &&
        !Number.isNaN(heelerClassificationNumber) &&
        !validateClassificationForEnd(heelerClassificationNumber, 'heeler')
      : classification.trim().length > 0 &&
        !Number.isNaN(classificationNumber) &&
        !validateClassificationForEnd(classificationNumber, position === 'Header' ? 'header' : 'heeler');

  const canSubmit =
    !!avatarPath && // CHANGED 2026-07-27: was optional - see the label change above
    fullName.trim().length > 0 &&
    homeArea.trim().length > 0 &&
    !!screenshotPath &&
    globalMembershipId.trim().length > 0 &&
    classificationValid &&
    guidelinesAccepted &&
    (isMinor
      ? guardianName.trim().length > 0 && guardianContact.trim().length > 0 && guardianConsent
      : contact.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      showToast('Session expired - sign in again');
      router.replace('/(auth)/sign-in');
      return;
    }

    // NEW, added 2026-07-27 - real gap flagged by the user: nothing
    // previously checked that the uploaded screenshot was even a real
    // Global Handicap card, let alone that its name/ID/classification
    // matched what's being claimed here. See verify-classification-card's
    // own file header for the full design (AI extracts, our own code
    // decides match/mismatch). A genuine mismatch blocks sign-up
    // entirely; the AI being unavailable does NOT block it - it just
    // gets flagged via needs_manual_review below instead.
    const verifyResult = await verifyClassificationCard({
      imagePath: screenshotPath!,
      claimedName: fullName.trim(),
      claimedMembershipId: globalMembershipId.trim(),
      position,
      claimedGlobalClassification: position === 'Switch' ? null : classificationNumber,
      claimedHeaderClassification: position === 'Switch' ? headerClassificationNumber : null,
      claimedHeelerClassification: position === 'Switch' ? heelerClassificationNumber : null,
    });

    if (!verifyResult.verified && !verifyResult.skipped) {
      setSubmitting(false);
      showToast(verifyResult.mismatches[0] ?? 'Could not verify your card - check your information and try again');
      return;
    }

    // NEW, added 2026-07-27 - "refer a friend." Blocks on an invalid
    // code rather than silently ignoring it - a silent failure here would
    // mean the person who shared their code never actually gets credit,
    // with no visible sign anything went wrong.
    let referredBy: string | null = null;
    if (referralCode.trim().length > 0) {
      const { data: resolvedId, error: referralError } = await supabase.rpc('resolve_referral_code', {
        code: referralCode.trim(),
      });
      if (referralError || !resolvedId) {
        setSubmitting(false);
        showToast("That referral code doesn't look right - check it and try again, or leave it blank.");
        return;
      }
      referredBy = resolvedId;
    }

    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      full_name: fullName.trim(),
      is_minor: isMinor,
      referred_by: referredBy,
      guardian_name: isMinor ? guardianName.trim() : null,
      guardian_contact: isMinor ? guardianContact.trim() : null,
      guardian_consent_at: isMinor ? new Date().toISOString() : null,
      position,
      home_area: homeArea.trim(),
      contact: isMinor ? null : contact.trim(),
      avatar_url: avatarPath,
      global_membership_id: globalMembershipId.trim(),
      global_classification: position === 'Switch' ? null : classificationNumber,
      header_classification: position === 'Switch' ? headerClassificationNumber : null,
      heeler_classification: position === 'Switch' ? heelerClassificationNumber : null,
      verification_screenshot_path: screenshotPath,
      needs_manual_review: !!verifyResult.skipped,
      // NEW, added 2026-07-27 - policy decision: an expired card doesn't
      // block sign-up (unlike a name/ID/number mismatch above), but it's
      // recorded and shown to other users so THEY can decide whether to
      // match with someone whose membership isn't current. See migration
      // 0033 and src/lib/matching.ts's isMembershipCurrent().
      membership_expiration_date: verifyResult.expirationDate ?? null,
    });

    setSubmitting(false);

    if (error) {
      // NEW, added 2026-07-27 alongside migration 0031's unique
      // constraint on global_membership_id - without this, a real
      // membership-ID conflict (someone else already registered under
      // this ID) would have shown a raw, confusing Postgres error
      // instead of a clear, actionable message.
      showToast(friendlySupabaseError(error));
      return;
    }

    setHasAthleteProfile(true);
    // NEW, added 2026-07-27 - one toast, not two: the expired-card notice
    // takes priority over the generic "Profile created" when both would
    // otherwise fire back to back (showToast only shows one at a time).
    showToast(
      verifyResult.isExpired
        ? 'Profile created - your card shows as expired, so your profile will display as "not current" to other ropers until you update it.'
        : 'Profile created'
    );
    // NEW, added 2026-07-30 - real ask: recruit Android testers for the
    // real app from right here, since a brand-new web sign-up is exactly
    // who'd want to know it exists. Passed unconditionally (not gated to
    // Platform.OS === 'web' here) - AndroidTesterBanner itself already
    // no-ops on native, so this param is simply ignored there rather than
    // needing the same platform check duplicated in two places.
    router.replace({ pathname: '/(tabs)', params: { justSignedUp: '1' } });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Steer Me" subtitle="Find your own partner. Skip the ~$40 draw-in fee." big logo onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Step 1 of 1</Text>
        <Text style={styles.h2}>Set up your roper profile</Text>
        <Text style={styles.helper}>This is what other athletes see when they're looking for a partner.</Text>

        {/* CHANGED 2026-07-27: was optional - now required, per direct
            discussion about classification/identity fraud. A real photo
            gives fellow contestants and producers an actual face to check
            against the name/number someone claims, the same social
            detection method that's realistically how impersonation gets
            caught today - a required, visible photo makes that easier,
            not just a nice-to-have. */}
        <Text style={styles.label}>Profile photo <Text style={styles.required}>*required</Text></Text>
        <Pressable style={styles.avatarRow} onPress={() => setPhotoTarget('avatar')}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={22} color={colors.saddle} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.avatarTitle}>Add a photo</Text>
            <Text style={styles.avatarSub}>Helps other ropers recognize you, and helps prevent someone else from using your identity.</Text>
          </View>
        </Pressable>

        <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Colt Bracken" required />

        <Text style={styles.label}>Age</Text>
        <View style={styles.pillRow}>
          <Pill label="18 or older" selected={!isMinor} onPress={() => setIsMinor(false)} />
          <Pill label="Under 18" selected={isMinor} onPress={() => setIsMinor(true)} />
        </View>

        {isMinor ? (
          <View style={{ marginBottom: 4 }}>
            <DividerNote>
              Because this roper is under 18, a parent or legal guardian must provide consent. Partner
              requests will be routed to the guardian for approval before any contact info is shared.
            </DividerNote>
            <TextField
              label="Parent/guardian name"
              value={guardianName}
              onChangeText={setGuardianName}
              placeholder="e.g. Renee Bracken"
              required
            />
            <TextField
              label="Parent/guardian phone or email"
              value={guardianContact}
              onChangeText={setGuardianContact}
              placeholder="e.g. (928) 555-0199"
              required
            />
            <Checkbox checked={guardianConsent} onToggle={() => setGuardianConsent((v) => !v)}>
              I am the parent or legal guardian of this roper and I consent to their profile, classification
              verification, and partner requests being managed through this app.
            </Checkbox>
          </View>
        ) : null}

        <Text style={styles.label}>
          Global Handicap screenshot <Text style={styles.required}>*required</Text>
        </Text>
        <Pressable style={styles.dropzone} onPress={() => setPhotoTarget('screenshot')}>
          {screenshotUri ? (
            <>
              <Image source={{ uri: screenshotUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Screenshot attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="camera-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Tap to upload a screenshot of your Global Handicap card</Text>
              <Text style={styles.dropzoneSub}>From globalhandicaps.com or your WSTR/USTRC login</Text>
            </>
          )}
        </Pressable>

        <TextField
          label="Global membership ID"
          value={globalMembershipId}
          onChangeText={setGlobalMembershipId}
          placeholder="e.g. G-204871"
          required
        />

        {/* Position moved above classification (was below it before this
            fix) - which classification field(s) to show depends on the
            position picked, so the picker needs to come first. */}
        <Text style={styles.label}>Position</Text>
        <View style={styles.pillRow}>
          <Pill label="Header" selected={position === 'Header'} onPress={() => setPosition('Header')} />
          <Pill label="Heeler" selected={position === 'Heeler'} onPress={() => setPosition('Heeler')} />
          <Pill label="Switch Ender" selected={position === 'Switch'} onPress={() => setPosition('Switch')} />
        </View>
        {position === 'Switch' ? (
          <Text style={styles.helper}>
            You rope both ends, so we need both numbers - header and heeler ratings are assessed
            independently and often differ (e.g. a 6.5 header / 8.0 heeler is a normal combination).
          </Text>
        ) : null}

        {position === 'Switch' ? (
          <>
            <TextField
              label="Header classification number"
              value={headerClassification}
              onChangeText={setHeaderClassification}
              placeholder="e.g. 6.5 (max 9)"
              keyboardType="decimal-pad"
              required
            />
            <TextField
              label="Heeler classification number"
              value={heelerClassification}
              onChangeText={setHeelerClassification}
              placeholder="e.g. 8 (max 10)"
              keyboardType="decimal-pad"
              required
            />
          </>
        ) : (
          <TextField
            label="Global classification number"
            value={classification}
            onChangeText={setClassification}
            placeholder="e.g. 4.5"
            keyboardType="decimal-pad"
            required
          />
        )}
        <Text style={styles.retentionNote}>
          We keep this screenshot only to confirm your classification. It's deleted the moment you update
          your classification or delete your profile.
        </Text>

        <AutocompleteField label="Home area" value={homeArea} onChange={setHomeArea} placeholder="e.g. Payson" required />

        {!isMinor ? (
          <TextField
            label="Phone or email"
            value={contact}
            onChangeText={setContact}
            placeholder="e.g. (928) 555-0134"
            required
          />
        ) : null}

        {/* NEW, added 2026-07-27 - "refer a friend." Optional; a friend
            of yours shares their own code (visible on their Referral
            screen) and you type it in here. */}
        <TextField
          label="Referral code (optional)"
          value={referralCode}
          onChangeText={setReferralCode}
          placeholder="Got a code from a friend? Enter it here"
          autoCapitalize="characters"
        />

        <DividerNote>
          <Text style={{ fontFamily: fonts.bodyBold }}>Community Guidelines{'\n'}</Text>
          Verified Global Handicap membership required to hold a profile · Be respectful — no foul
          language · No sexually explicit or suggestive content · No soliciting minors, ever · Confirmed
          violations are enforced on a 3-strike basis: a 3rd confirmed violation results in suspension,
          account deletion, and your data being scrubbed.
        </DividerNote>
        <Checkbox checked={guidelinesAccepted} onToggle={() => setGuidelinesAccepted((v) => !v)}>
          I have read and agree to the{' '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => router.push({ pathname: '/legal', params: { doc: 'community' } })}
          >
            Community Guidelines
          </Text>
          .
        </Checkbox>

        <Button
          label="Create profile"
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
          style={styles.submit}
        />
      </ScrollView>

      <PhotoChooserSheet
        visible={photoTarget !== null}
        onClose={() => setPhotoTarget(null)}
        onPicked={handlePicked}
      />
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="sign-up" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.brass,
    marginBottom: 6,
  },
  h2: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.espresso, marginBottom: 4 },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
    marginTop: 2,
  },
  required: { color: colors.brass, textTransform: 'none' },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tanLight,
    borderWidth: 1.5,
    borderColor: colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.espresso },
  avatarSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 1, lineHeight: 15 },
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
  dropzoneText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.espresso,
    marginTop: 6,
    textAlign: 'center',
  },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: colors.saddle, marginTop: 2, textAlign: 'center' },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
  retentionNote: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.saddle,
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 15,
  },
  submit: { marginTop: 16 },
});
