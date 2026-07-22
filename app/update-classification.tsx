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
import { supabase } from '@/src/lib/supabase';
import { removeUserFile, uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';

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
  const canSubmit =
    !!screenshotPath && globalMembershipId.trim().length > 0 && !Number.isNaN(classificationNumber);

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

    const oldPath = profile?.verification_screenshot_path ?? null;

    const { error } = await supabase
      .from('profiles')
      .update({
        global_membership_id: globalMembershipId.trim(),
        global_classification: classificationNumber,
        verification_screenshot_path: screenshotPath,
      })
      .eq('id', user.id);

    if (error) {
      setSubmitting(false);
      showToast(error.message);
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
    showToast('Classification updated - your previous screenshot was deleted');
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
        <TextField
          label="Global classification number"
          value={classification}
          onChangeText={setClassification}
          placeholder="e.g. 4.5"
          keyboardType="decimal-pad"
        />

        <Button label="Save classification" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />
      </ScrollView>
      <PhotoChooserSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={handlePicked} />
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="update-classification" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20 },
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
    marginBottom: 16,
  },
  dropzoneImage: { width: '100%', height: 130, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6 },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
