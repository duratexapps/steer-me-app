import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { removeUserFile, uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';
import { validateClassificationForEnd } from '@/src/lib/matching';
import { friendlySupabaseError } from '@/src/lib/errors';
import { verifyClassificationCard } from '@/src/lib/verification';

// Mirrors "Update my classification" from Profile (Screen 6) - re-verifying
// replaces and deletes the old screenshot, per Privacy Policy section 5.
export default function UpdateClassification() {
  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();

  const [photoOpen, setPhotoOpen] = useState(false);
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [globalMembershipId, setGlobalMembershipId] = useState(profile?.global_membership_id ?? '');
  const [classification, setClassification] = useState(
    profile?.global_classification != null ? String(profile.global_classification) : ''
  );
  // Real bug fix 2026-07-25 (see migration 0030): Switch Enders need both
  // a header and heeler number, assessed independently - see the matching
  // sign-up.tsx note for the full reasoning. isSwitch is fixed from the
  // existing profile - this screen re-verifies classification, it doesn't
  // let someone change their position.
  const isSwitch = profile?.position === 'Switch';
  const [headerClassification, setHeaderClassification] = useState(
    profile?.header_classification != null ? String(profile.header_classification) : ''
  );
  const [heelerClassification, setHeelerClassification] = useState(
    profile?.heeler_classification != null ? String(profile.heeler_classification) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  async function handlePicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setScreenshotUri(image.uri);
    try {
      const path = await uploadUserFile('verification-screenshots', user.id, image, 'global-handicap');
      setScreenshotPath(path);
    } catch {
      showToast('Could not upload screenshot - try again');
    }
  }

  const classificationNumber = parseFloat(classification);
  const headerClassificationNumber = parseFloat(headerClassification);
  const heelerClassificationNumber = parseFloat(heelerClassification);

  const classificationValid = isSwitch
    ? !Number.isNaN(headerClassificationNumber) &&
      !validateClassificationForEnd(headerClassificationNumber, 'header') &&
      !Number.isNaN(heelerClassificationNumber) &&
      !validateClassificationForEnd(heelerClassificationNumber, 'heeler')
    : !Number.isNaN(classificationNumber) &&
      !validateClassificationForEnd(classificationNumber, profile?.position === 'Header' ? 'header' : 'heeler');

  const canSubmit = !!screenshotPath && globalMembershipId.trim().length > 0 && classificationValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    // NEW, added 2026-07-27 - same real-card verification as sign-up.tsx,
    // see that file's matching comment and verify-classification-card's
    // own file header for the full design. claimedName comes from the
    // existing profile, not a form field here - this screen doesn't let
    // someone change their name, only re-verify their classification.
    const verifyResult = await verifyClassificationCard({
      imagePath: screenshotPath!,
      claimedName: profile?.full_name ?? '',
      claimedMembershipId: globalMembershipId.trim(),
      position: profile?.position ?? 'Heeler',
      claimedGlobalClassification: isSwitch ? null : classificationNumber,
      claimedHeaderClassification: isSwitch ? headerClassificationNumber : null,
      claimedHeelerClassification: isSwitch ? heelerClassificationNumber : null,
    });

    if (!verifyResult.verified && !verifyResult.skipped) {
      setSubmitting(false);
      showToast(verifyResult.mismatches[0] ?? 'Could not verify your card - check your information and try again');
      return;
    }

    const oldPath = profile?.verification_screenshot_path ?? null;

    const { error } = await supabase
      .from('profiles')
      .update({
        global_membership_id: globalMembershipId.trim(),
        global_classification: isSwitch ? null : classificationNumber,
        header_classification: isSwitch ? headerClassificationNumber : null,
        heeler_classification: isSwitch ? heelerClassificationNumber : null,
        verification_screenshot_path: screenshotPath,
        needs_manual_review: !!verifyResult.skipped,
        // NEW, added 2026-07-27 - see sign-up.tsx's matching comment and
        // migration 0033 - an expired card doesn't block this update, but
        // gets recorded and shown to other users.
        membership_expiration_date: verifyResult.expirationDate ?? null,
      })
      .eq('id', user.id);

    if (error) {
      setSubmitting(false);
      // Same reasoning as sign-up.tsx's matching change - migration
      // 0031's unique constraint on global_membership_id needs a clear,
      // actionable message here too, since a user can also trigger this
      // conflict when updating their ID later, not just at signup.
      showToast(friendlySupabaseError(error));
      return;
    }

    // The upload path uses a fixed filename per user, so re-uploading
    // usually overwrites the same storage object already. This only matters
    // if the file extension changed (e.g. .jpg -> .png), leaving the old
    // object orphaned at a different path - clean that up explicitly.
    if (oldPath && screenshotPath && oldPath !== screenshotPath) {
      await removeUserFile('verification-screenshots', oldPath);
    }

    setSubmitting(false);
    invalidateProfile();
    // NEW, added 2026-07-27 - same one-toast-not-two reasoning as sign-up.tsx.
    showToast(
      verifyResult.isExpired
        ? 'Classification updated - your card shows as expired, so your profile will display as "not current" to other ropers until you update it.'
        : 'Classification updated - your previous screenshot was deleted'
    );
    router.back();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Update Classification"
        subtitle="Uploading a new screenshot replaces and deletes the old one"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>
          Global Handicap screenshot <Text style={styles.required}>*required</Text>
        </Text>
        <Pressable style={styles.dropzone} onPress={() => setPhotoOpen(true)}>
          {screenshotUri ? (
            <>
              <Image source={{ uri: screenshotUri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Screenshot attached</Text>
            </>
          ) : (
            <>
              <Ionicons name="camera-outline" size={26} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Tap to upload a new screenshot</Text>
            </>
          )}
        </Pressable>

        <TextField
          label="Global membership ID"
          value={globalMembershipId}
          onChangeText={setGlobalMembershipId}
          placeholder="e.g. G-204871"
        />
        {isSwitch ? (
          <>
            <Text style={styles.switchNote}>
              As a Switch Ender, you need both numbers - header and heeler ratings are assessed
              independently and often differ.
            </Text>
            <TextField
              label="Header classification number"
              value={headerClassification}
              onChangeText={setHeaderClassification}
              placeholder="e.g. 6.5 (max 9)"
              keyboardType="decimal-pad"
            />
            <TextField
              label="Heeler classification number"
              value={heelerClassification}
              onChangeText={setHeelerClassification}
              placeholder="e.g. 8 (max 10)"
              keyboardType="decimal-pad"
            />
          </>
        ) : (
          <TextField
            label="Global classification number"
            value={classification}
            onChangeText={setClassification}
            placeholder="e.g. 4.5"
            keyboardType="decimal-pad"
          />
        )}

        <Button label="Save classification" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />
      </ScrollView>
      <PhotoChooserSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={handlePicked} />
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="update-classification" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
  },
  required: { color: colors.brass, textTransform: 'none' },
  switchNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 12, lineHeight: 17 },
  dropzone: {
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  dropzoneImage: { width: '100%', height: 130, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6 },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
