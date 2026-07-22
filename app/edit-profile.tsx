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
import { DividerNote } from '@/src/components/ui/DividerNote';
import { PhotoChooserSheet } from '@/src/components/PhotoChooserSheet';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { publicUrlFor, uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import type { Position } from '@/src/lib/matching';
import { showToast } from '@/src/state/toast-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';

// There was previously no way to update anything set at sign-up besides
// classification (which has its own dedicated re-verification flow) - a
// mover, a new phone number, or a change in what end someone ropes had
// nowhere to go. This screen covers everything else: name, position
// (including the new Switch Ender option), home area, contact/guardian
// contact, and avatar. Global ID/classification/screenshot stay in Update
// Classification, since those involve re-verification, not a plain edit.
export default function EditProfile() {
  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();

  const [photoOpen, setPhotoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(publicUrlFor('avatars', profile?.avatar_url));
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_url ?? null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [position, setPosition] = useState<Position>(profile?.position ?? 'Heeler');
  const [homeArea, setHomeArea] = useState(profile?.home_area ?? '');
  const [contact, setContact] = useState(profile?.contact ?? '');
  const [guardianName, setGuardianName] = useState(profile?.guardian_name ?? '');
  const [guardianContact, setGuardianContact] = useState(profile?.guardian_contact ?? '');
  const [submitting, setSubmitting] = useState(false);

  const isMinor = profile?.is_minor ?? false;

  async function handlePicked(image: PickedImage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setAvatarUri(image.uri);
    try {
      const path = await uploadUserFile('avatars', user.id, image, 'avatar');
      setAvatarPath(path);
    } catch {
      showToast('Could not upload photo - try again');
    }
  }

  const canSubmit =
    fullName.trim().length > 0 &&
    homeArea.trim().length > 0 &&
    (isMinor ? guardianName.trim().length > 0 && guardianContact.trim().length > 0 : contact.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit || !profile) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        position,
        home_area: homeArea.trim(),
        avatar_url: avatarPath,
        ...(isMinor
          ? { guardian_name: guardianName.trim(), guardian_contact: guardianContact.trim() }
          : { contact: contact.trim() }),
      })
      .eq('id', profile.id);

    setSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }

    invalidateProfile();
    showToast('Profile updated');
    router.back();
  }

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Edit Profile" subtitle="Update your info any time" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Profile photo</Text>
        <Pressable style={styles.avatarRow} onPress={() => setPhotoOpen(true)}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={22} color={colors.saddle} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.avatarTitle}>Change photo</Text>
            <Text style={styles.avatarSub}>Shown on your profile and posts.</Text>
          </View>
        </Pressable>

        <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Colt Bracken" />

        <Text style={styles.label}>Position</Text>
        <View style={styles.pillRow}>
          <Pill label="Header" selected={position === 'Header'} onPress={() => setPosition('Header')} />
          <Pill label="Heeler" selected={position === 'Heeler'} onPress={() => setPosition('Heeler')} />
          <Pill label="Switch Ender" selected={position === 'Switch'} onPress={() => setPosition('Switch')} />
        </View>
        <Text style={styles.helper}>
          {position === 'Switch'
            ? "You'll be shown potential partners for both ends - header and heeler."
            : `You'll be shown potential ${position === 'Header' ? 'heeler' : 'header'} matches.`}
        </Text>

        <AutocompleteField label="Home area" value={homeArea} onChange={setHomeArea} placeholder="e.g. Payson" required />

        {isMinor ? (
          <View>
            <DividerNote>
              This is a guardian-managed profile. Update the guardian's own contact info below if it's
              changed - a minor's direct contact is never collected or shown to other users.
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
          </View>
        ) : (
          <TextField
            label="Phone or email"
            value={contact}
            onChangeText={setContact}
            placeholder="e.g. (928) 555-0134"
          />
        )}

        <Button label="Save changes" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} style={{ marginTop: 8 }} />
      </ScrollView>
      <PhotoChooserSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={handlePicked} />
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="edit-profile" />
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
  },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17, marginTop: -8 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
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
});
