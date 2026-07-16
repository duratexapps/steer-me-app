import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Tag } from '@/src/components/ui/Tag';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { publicUrlFor, removeUserFile } from '@/src/lib/storage-upload';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { formatPosition } from '@/src/lib/matching';

// Mirrors Screen 6 (#profile). Two necessary additions beyond the
// prototype: a real Sign Out action (the prototype has no auth at all), and
// dropping the "Enable notifications" toggle since the Notifications
// feature it would control isn't in v1 scope.
export default function Profile() {
  const hasAthleteProfile = useSessionStore((s) => s.hasAthleteProfile);
  const setHasAthleteProfile = useSessionStore((s) => s.setHasAthleteProfile);
  const { data: profile, isLoading } = useMyProfile();
  const [deleting, setDeleting] = useState(false);

  const avatarUrl = publicUrlFor('avatars', profile?.avatar_url);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/role-select');
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your profile & data?',
      'This permanently deletes your classification, screenshot, and profile. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!profile) return;
    setDeleting(true);

    if (profile.verification_screenshot_path) {
      await removeUserFile('verification-screenshots', profile.verification_screenshot_path);
    }
    if (profile.avatar_url) {
      await removeUserFile('avatars', profile.avatar_url);
    }

    const { error } = await supabase.from('profiles').delete().eq('id', profile.id);
    setDeleting(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setHasAthleteProfile(false);
    showToast('Profile and screenshot deleted');
    router.replace('/(tabs)');
  }

  if (hasAthleteProfile && isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Profile" subtitle="Your Global-issued info" />
        <ActivityIndicator color={colors.rust} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Profile" subtitle="Your Global-issued info" />
        <View style={styles.content}>
          <Text style={styles.sub}>
            You haven't set up an athlete profile yet. Set one up to verify your Global classification and
            find partners.
          </Text>
          <Button
            label="Set up an athlete profile"
            onPress={() => router.push('/(auth)/sign-up')}
            style={styles.updateBtn}
          />
          <Button label="Sign out" variant="ghost" onPress={handleSignOut} style={styles.spacedBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Profile" subtitle="Your Global-issued info" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Tag value={profile.global_classification ?? '—'} size="big" />
          )}
          <View>
            <Text style={styles.name}>{profile.full_name}</Text>
            <Text style={styles.sub}>
              {formatPosition(profile.position)} · {profile.home_area}
            </Text>
            {profile.is_minor ? <Text style={styles.minorBadge}>Guardian-managed profile</Text> : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardMeta}>Global Membership ID</Text>
          <Text style={styles.cardValueMono}>{profile.global_membership_id}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardMeta}>Classification</Text>
          <Text style={styles.cardValue}>{profile.global_classification}</Text>
        </View>

        <Button
          label="Edit profile"
          variant="outline"
          onPress={() => router.push('/edit-profile')}
          style={styles.updateBtn}
        />
        <Text style={styles.retentionNote}>Name, position, home area, avatar, and contact info.</Text>

        <Button
          label="Update my classification"
          variant="outline"
          onPress={() => router.push('/update-classification')}
          style={styles.spacedBtn}
        />
        <Text style={styles.retentionNote}>Uploading a new screenshot replaces and deletes the old one.</Text>

        <Button
          label="View subscription plan"
          variant="outline"
          onPress={() => router.push('/subscription')}
          style={styles.spacedBtn}
        />
        <Button
          label="Manage blocked users"
          variant="outline"
          onPress={() => router.push('/blocked-users')}
          style={styles.spacedBtn}
        />
        <Button label="Sign out" variant="ghost" onPress={handleSignOut} style={styles.spacedBtn} />
        <Button
          label="Delete my profile & data"
          variant="danger"
          onPress={confirmDelete}
          loading={deleting}
          style={styles.spacedBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 36 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.leather },
  sub: { fontFamily: fonts.body, fontSize: 12.5, color: '#6b5c47', marginTop: 2 },
  minorBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    color: colors.rust,
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.rope,
    borderLeftWidth: 4,
    borderLeftColor: colors.leather,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12,
  },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.leather },
  cardValueMono: { fontFamily: fonts.monoRegular, fontSize: 14, color: colors.ink, marginTop: 2 },
  cardValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink, marginTop: 2 },
  updateBtn: { marginTop: 8 },
  retentionNote: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11,
    color: '#6b5c47',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  spacedBtn: { marginBottom: 14 },
});
