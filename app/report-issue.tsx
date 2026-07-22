import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { useMyProducerProfile } from '@/src/hooks/useProducerProfile';
import { useSubmitIssueReport, type ReporterRole } from '@/src/hooks/useIssueReports';
import type { PickedImage } from '@/src/lib/image-picker';

// Reachable from every screen via ScreenHeader's flag icon. Deliberately
// asks who the reporter is rather than trusting the session alone - a
// signed-in user might have neither an athlete nor a producer profile yet
// (mid-onboarding), so there's nothing to resolve a name from, and the
// role (contestant vs producer) isn't otherwise inferrable from account
// state the way hasAthleteProfile/hasProducerProfile flags are elsewhere.
export default function ReportIssue() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { data: profile } = useMyProfile();
  const { data: producerProfile } = useMyProducerProfile();
  const submitReport = useSubmitIssueReport();

  const resolvedName = profile?.full_name || producerProfile?.contact_name || null;

  const [role, setRole] = useState<ReporterRole>('contestant');
  const [description, setDescription] = useState('');
  const [nameOverride, setNameOverride] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<PickedImage | null>(null);

  const canSubmit = description.trim().length > 0 && !!(resolvedName || nameOverride.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await submitReport.mutateAsync({
        role,
        description: description.trim(),
        pageContext: from ?? 'unknown',
        reporterNameOverride: resolvedName ? undefined : nameOverride,
        screenshot: screenshot ?? undefined,
      });
      router.back();
    } catch {
      // Toast already shown by the hook's onError - stay on the screen so
      // nothing typed gets lost.
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Report an Issue" subtitle="Ran into a bug or something confusing? Tell us." onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>You are a</Text>
        <View style={styles.pillRow}>
          <Pill label="Contestant" selected={role === 'contestant'} onPress={() => setRole('contestant')} />
          <Pill label="Producer" selected={role === 'producer'} onPress={() => setRole('producer')} />
        </View>

        {resolvedName ? (
          <DividerNote>Reporting as {resolvedName}. We'll know who to follow up with.</DividerNote>
        ) : (
          <TextField
            label="Your name"
            value={nameOverride}
            onChangeText={setNameOverride}
            placeholder="So we know who to follow up with"
            required
          />
        )}

        <TextField
          label="What happened?"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what you were doing and what went wrong"
          multiline
          numberOfLines={5}
          style={styles.multilineInput}
          required
        />

        <Text style={styles.label}>Screenshot (optional)</Text>
        <Pressable style={styles.dropzone} onPress={() => setPhotoOpen(true)}>
          {screenshot ? (
            <>
              <Image source={{ uri: screenshot.uri }} style={styles.dropzoneImage} />
              <Text style={styles.dropzoneDone}>✓ Screenshot attached - tap to change</Text>
            </>
          ) : (
            <>
              <Ionicons name="camera-outline" size={24} color={colors.espresso} />
              <Text style={styles.dropzoneText}>Tap to attach a screenshot</Text>
            </>
          )}
        </Pressable>

        <Button
          label="Submit report"
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitReport.isPending}
          style={styles.submit}
        />
      </ScrollView>

      <PhotoChooserSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={setScreenshot} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.espresso,
    marginBottom: 6,
    marginTop: 2,
  },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  multilineInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 },
  dropzone: {
    borderWidth: 1.5,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    backgroundColor: colors.tanLight,
    padding: 18,
    alignItems: 'center',
    marginBottom: 6,
  },
  dropzoneImage: { width: '100%', height: 140, borderRadius: radii.md, marginBottom: 8 },
  dropzoneText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.espresso, marginTop: 6, textAlign: 'center' },
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
  submit: { marginTop: 16 },
});
