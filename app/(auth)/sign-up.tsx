import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';

type PhotoTarget = 'avatar' | 'screenshot' | null;

// Mirrors Screen 1 (#signup). The prototype fakes OCR on the Global
// Handicap screenshot (auto-fills membership ID/classification after a
// staged setTimeout "scan"). Per the confirmed v1 decision, this is manual
// entry instead - the screenshot is stored as supporting evidence, not fed
// through a vision API.
export default function SignUp() {
  const setHasAthleteProfile = useSessionStore((s) => s.setHasAthleteProfile);

  const [photoTarget, setPhotoTarget] = useState<PhotoTarget>(null);
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

  const [position, setPosition] = useState<'Header' | 'Heeler'>('Heeler');
  const [homeArea, setHomeArea] = useState('');
  const [contact, setContact] = useState('');
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  const classificationValid = classification.trim().length > 0 && !Number.isNaN(classificationNumber);

  const canSubmit =
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

    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      full_name: fullName.trim(),
      is_minor: isMinor,
      guardian_name: isMinor ? guardianName.trim() : null,
      guardian_contact: isMinor ? guardianContact.trim() : null,
      guardian_consent_at: isMinor ? new Date().toISOString() : null,
      position,
      home_area: homeArea.trim(),
      contact: isMinor ? null : contact.trim(),
      avatar_url: avatarPath,
      global_membership_id: globalMembershipId.trim(),
      global_classification: classificationNumber,
      verification_screenshot_path: screenshotPath,
    });

    setSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setHasAthleteProfile(true);
    showToast('Profile created');
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Steer Me" subtitle="Find your own partner. Skip the ~$40 draw-in fee." big logo />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Step 1 of 1</Text>
        <Text style={styles.h2}>Set up your roper profile</Text>
        <Text style={styles.helper}>This is what other athletes see when they're looking for a partner.</Text>

        <Text style={styles.label}>Profile photo (optional)</Text>
        <Pressable style={styles.avatarRow} onPress={() => setPhotoTarget('avatar')}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={22} color={colors.rope} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.avatarTitle}>Add a photo</Text>
            <Text style={styles.avatarSub}>Helps other ropers recognize you. Shown on your profile and posts.</Text>
          </View>
        </Pressable>

        <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Colt Bracken" />

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
            />
            <TextField
              label="Parent/guardian phone or email"
              value={guardianContact}
              onChangeText={setGuardianContact}
              placeholder="e.g. (928) 555-0199"
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
              <Ionicons name="camera-outline" size={26} color={colors.leather} />
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
        />
        <TextField
          label="Global classification number"
          value={classification}
          onChangeText={setClassification}
          placeholder="e.g. 4.5"
          keyboardType="decimal-pad"
        />
        <Text style={styles.retentionNote}>
          We keep this screenshot only to confirm your classification. It's deleted the moment you update
          your classification or delete your profile.
        </Text>

        <Text style={styles.label}>Position</Text>
        <View style={styles.pillRow}>
          <Pill label="Header" selected={position === 'Header'} onPress={() => setPosition('Header')} />
          <Pill label="Heeler" selected={position === 'Heeler'} onPress={() => setPosition('Heeler')} />
        </View>

        <TextField label="Home area" value={homeArea} onChangeText={setHomeArea} placeholder="e.g. Payson, AZ" />

        {!isMinor ? (
          <TextField
            label="Phone or email"
            value={contact}
            onChangeText={setContact}
            placeholder="e.g. (928) 555-0134"
          />
        ) : null}

        <DividerNote>
          <Text style={{ fontFamily: fonts.bodyBold }}>Community Guidelines{'\n'}</Text>
          Verified Global Handicap membership required to hold a profile · Be respectful — no foul
          language · No sexually explicit or suggestive content · No soliciting minors, ever · Confirmed
          violations are enforced on a 3-strike basis: a 3rd confirmed violation results in suspension,
          account deletion, and your data being scrubbed.
        </DividerNote>
        <Checkbox checked={guidelinesAccepted} onToggle={() => setGuidelinesAccepted((v) => !v)}>
          I have read and agree to the Community Guidelines.
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
    marginBottom: 6,
  },
  h2: { fontFamily: fonts.display, fontSize: 22, color: colors.leather, marginBottom: 4 },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: '#6b5c47', marginBottom: 16, lineHeight: 17 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.leather,
    marginBottom: 6,
    marginTop: 2,
  },
  required: { color: colors.rust, textTransform: 'none' },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tanLight,
    borderWidth: 2,
    borderColor: colors.rope,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.leather },
  avatarSub: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', marginTop: 1, lineHeight: 15 },
  dropzone: {
    borderWidth: 2,
    borderColor: colors.rope,
    borderStyle: 'dashed',
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
    color: colors.leather,
    marginTop: 6,
    textAlign: 'center',
  },
  dropzoneSub: { fontFamily: fonts.body, fontSize: 11, color: '#6b5c47', marginTop: 2, textAlign: 'center' },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
  retentionNote: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11,
    color: '#6b5c47',
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 15,
  },
  submit: { marginTop: 16 },
});
