import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { DateField } from '@/src/components/ui/DateField';
import { Button } from '@/src/components/ui/Button';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDateDisplay } from '@/src/lib/date';
import { supabase } from '@/src/lib/supabase';
import { signedUrlFor, uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';
import { useMyHorseDocuments, useAddHorseDocument, useDeleteHorseDocument, useCreateCogginsShare, type HorseDocument } from '@/src/hooks/useHorseDocuments';

// Real gap flagged directly by the user: many fliers require a negative
// Coggins (EIA test) on hand at check-in, and a roper who gets asked for
// it sometimes has to go dig it out of the trailer. This is where it lives
// instead - one document per horse (a roper hauling multiple horses needs
// one per horse, not one per person) - plus the "Show at the gate" flow
// that hands staff a short-lived link/QR with no login needed to view it.
export default function MyHorses() {
  const { data: horses, isLoading } = useMyHorseDocuments();
  const addDoc = useAddHorseDocument();
  const deleteDoc = useDeleteHorseDocument();
  const createShare = useCreateCogginsShare();
  const [helpOpen, setHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [horseName, setHorseName] = useState('');
  const [description, setDescription] = useState('');
  const [testDate, setTestDate] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [docUri, setDocUri] = useState<string | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const h of horses ?? []) {
        if (thumbnails[h.id]) continue;
        const url = await signedUrlFor('coggins-documents', h.document_path);
        if (!cancelled && url) setThumbnails((prev) => ({ ...prev, [h.id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horses]);

  async function handlePicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setDocUri(image.uri);
    try {
      const path = await uploadUserFile('coggins-documents', user.id, image, `coggins-${Date.now()}`);
      setDocPath(path);
    } catch {
      showToast('Could not upload photo - try again');
    }
  }

  const canSubmit = horseName.trim().length > 0 && !!docPath;

  async function handleAdd() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await addDoc.mutateAsync({
        horseName: horseName.trim(),
        description: description.trim() || null,
        documentPath: docPath!,
        testDate,
      });
      showToast(`Added ${horseName.trim()}`);
      setHorseName('');
      setDescription('');
      setTestDate(null);
      setDocUri(null);
      setDocPath(null);
      setAddOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete(h: HorseDocument) {
    Alert.alert(`Remove ${h.horse_name}?`, 'This deletes the document permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteDoc.mutate({ id: h.id, documentPath: h.document_path }) },
    ]);
  }

  async function handleShowAtGate() {
    if (!horses || horses.length === 0) return;
    try {
      const share = await createShare.mutateAsync();
      router.push({ pathname: '/show-coggins', params: { token: share.token, expiresAt: share.expires_at } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create share link');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="My Horses"
        subtitle="Keep your Coggins on hand and share it at the gate"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <DividerNote>
          One negative Coggins (EIA test) per horse - upload it once and it's always on your phone, no trip
          back to the trailer when staff asks. "Show at the gate" makes a short-lived link/QR staff can view
          with no Steer Me account of their own - it expires in 30 minutes and a fresh one is made every
          time you tap it.
        </DividerNote>

        {horses && horses.length > 0 ? (
          <Button
            label={createShare.isPending ? 'Creating link...' : 'Show at the gate'}
            onPress={handleShowAtGate}
            loading={createShare.isPending}
            style={{ marginBottom: 20 }}
          />
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 12 }} />
        ) : !horses || horses.length === 0 ? (
          <DividerNote>No horses added yet. Add one below.</DividerNote>
        ) : (
          horses.map((h) => (
            <View key={h.id} style={styles.card}>
              {thumbnails[h.id] ? <Image source={{ uri: thumbnails[h.id] }} style={styles.thumb} /> : <View style={styles.thumbPlaceholder} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.horseName}>{h.horse_name}</Text>
                {h.description ? <Text style={styles.horseMeta}>{h.description}</Text> : null}
                <Text style={styles.horseMeta}>{h.test_date ? `Tested ${formatDateDisplay(h.test_date)}` : 'No test date on file'}</Text>
              </View>
              <Pressable onPress={() => confirmDelete(h)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.oxblood} />
              </Pressable>
            </View>
          ))
        )}

        {addOpen ? (
          <View style={styles.addForm}>
            <TextField label="Horse name" value={horseName} onChangeText={setHorseName} placeholder="e.g. Slick" />
            <TextField label="Description (optional)" value={description} onChangeText={setDescription} placeholder="e.g. Sorrel gelding, blaze" />
            <DateField label="Test date (optional)" value={testDate} onChange={setTestDate} />

            <Text style={styles.label}>
              Coggins document <Text style={styles.required}>*required</Text>
            </Text>
            <Pressable style={styles.dropzone} onPress={() => setPhotoOpen(true)}>
              {docUri ? (
                <>
                  <Image source={{ uri: docUri }} style={styles.dropzoneImage} />
                  <Text style={styles.dropzoneDone}>✓ Document attached</Text>
                </>
              ) : (
                <>
                  <Ionicons name="camera-outline" size={26} color={colors.espresso} />
                  <Text style={styles.dropzoneText}>Take a photo or upload a scan of the negative Coggins</Text>
                </>
              )}
            </Pressable>

            <Button label="Save horse" onPress={handleAdd} disabled={!canSubmit} loading={submitting} style={{ marginTop: 8 }} />
          </View>
        ) : (
          <Button label="+ Add a horse" variant="outline" onPress={() => setAddOpen(true)} style={{ marginTop: 8 }} />
        )}
      </ScrollView>
      <PhotoChooserSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={handlePicked} />
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="my-horses" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 12,
  },
  thumb: { width: 48, height: 48, borderRadius: radii.md },
  thumbPlaceholder: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.tan },
  horseName: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.espresso },
  horseMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: 1 },
  addForm: { marginTop: 16 },
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
  dropzoneDone: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green },
});
