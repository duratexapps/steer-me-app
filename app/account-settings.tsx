import { useEffect, useState } from 'react';
import { Linking as RNLinking, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { ToggleRow } from '@/src/components/ui/ToggleRow';
import { HelpModal } from '@/src/components/HelpModal';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile, useInvalidateMyProfile } from '@/src/hooks/useMyProfile';
import { registerForPushNotifications, unregisterPushNotifications } from '@/src/lib/push-notifications';

// NEW, added 2026-07-31 - closes a real gap found while manually changing
// an admin account's login email via the Supabase Admin API: there was no
// in-app way for an ordinary user to do this themselves. Two independent
// forms (email, password), since there's no reason a password change
// should require re-typing a new email or vice versa.
export default function AccountSettings() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  // NEW, added 2026-07-31 - notifications toggle. Only meaningful for an
  // athlete-profile account: draw_pro_entry_links.steer_me_user_id has a
  // hard FK to profiles(id) (migration 0042), so a producer-only account
  // (no profiles row at all - see profile.tsx's own !profile branch) can
  // never have a Draw Pro entry to be notified about in the first place.
  // Hidden entirely rather than shown-but-nonfunctional for that case.
  const userId = useSessionStore((s) => s.session?.user.id);
  const { data: profile } = useMyProfile();
  const invalidateProfile = useInvalidateMyProfile();
  const [notifSubmitting, setNotifSubmitting] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const notificationsEnabled = !!profile?.expo_push_token;

  const [newEmail, setNewEmail] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email ?? null));
  }, []);

  async function handleUpdateEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed) {
      showToast('Enter a new email address');
      return;
    }
    if (trimmed === currentEmail) {
      showToast("That's already your current email");
      return;
    }

    setEmailSubmitting(true);
    // emailRedirectTo reuses the same landing screen sign-up confirmation
    // already uses (app/confirm-email.tsx) - it generically completes
    // whatever pending auth change brought it a code/token, regardless of
    // whether that's a signup or an email change.
    const { data, error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: Linking.createURL('confirm-email') }
    );
    setEmailSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }

    // Whether this takes effect immediately or needs a confirmation link
    // click depends on this Supabase project's "Confirm email" / "Secure
    // email change" settings - checking the returned user's actual email
    // (rather than assuming one behavior) reports the truth either way.
    if (data.user?.email === trimmed) {
      setCurrentEmail(trimmed);
      setNewEmail('');
      showToast('Email updated');
    } else {
      setNewEmail('');
      showToast('Check your new email (and possibly your current one) to confirm the change');
    }
  }

  async function handleUpdatePassword() {
    if (!currentPassword) {
      showToast('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match');
      return;
    }
    if (!currentEmail) {
      showToast('Could not confirm your account - try signing in again');
      return;
    }

    setPasswordSubmitting(true);
    // Supabase's updateUser() doesn't require re-proving the current
    // password on its own (an active session is enough) - re-authing
    // first is a deliberate extra safeguard against someone at an
    // already-unlocked device changing the password with no verification
    // at all.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });
    if (reauthError) {
      setPasswordSubmitting(false);
      showToast('Current password is incorrect');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSubmitting(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showToast('Password updated');
  }

  async function handleToggleNotifications() {
    if (!userId) return;
    setNotifSubmitting(true);
    setPermissionBlocked(false);
    try {
      if (notificationsEnabled) {
        await unregisterPushNotifications(userId);
        showToast('Notifications turned off');
      } else {
        const result = await registerForPushNotifications(userId);
        if (result === 'granted') {
          showToast('Notifications enabled');
        } else if (result === 'denied') {
          // requestPermissionsAsync() only prompts the FIRST time - once
          // denied (here or at any earlier point), the only way to
          // change it is the OS Settings app, which the "Open Settings"
          // button below links to.
          setPermissionBlocked(true);
          showToast('Notifications are blocked for Steer Me in your device settings');
        } else if (result === 'unsupported') {
          showToast('Notifications are not available on web yet - use the mobile app');
        } else {
          showToast('Could not enable notifications - try again');
        }
      }
      invalidateProfile();
    } finally {
      setNotifSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader
        title="Account Settings"
        subtitle="Change your login email or password"
        onBack={() => router.back()}
        onHelp={() => setHelpOpen(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Email</Text>
        <Text style={styles.currentValue}>Current: {currentEmail ?? '...'}</Text>
        <TextField
          label="New email"
          value={newEmail}
          onChangeText={setNewEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
        />
        <Button label="Update email" onPress={handleUpdateEmail} loading={emailSubmitting} style={styles.submit} />

        <Text style={[styles.sectionTitle, styles.secondSection]}>Password</Text>
        <TextField
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          textContentType="password"
        />
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          textContentType="newPassword"
          placeholder="At least 8 characters"
        />
        <TextField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        <Button
          label="Update password"
          onPress={handleUpdatePassword}
          loading={passwordSubmitting}
          style={styles.submit}
        />

        {profile && Platform.OS !== 'web' ? (
          <>
            <Text style={[styles.sectionTitle, styles.secondSection]}>Notifications</Text>
            <ToggleRow
              title="Draw Pro notifications"
              description="Get notified when a producer finalizes your draw or posts your results for an event you entered."
              value={notificationsEnabled}
              onToggle={handleToggleNotifications}
            />
            {notifSubmitting ? <Text style={styles.currentValue}>Updating…</Text> : null}
            {permissionBlocked ? (
              <Button
                label="Open device settings"
                variant="outline"
                onPress={() => RNLinking.openSettings()}
                style={styles.submit}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="account-settings" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingBottom: 36, ...webMaxWidth },
  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: colors.espresso,
    marginBottom: 6,
  },
  secondSection: { marginTop: 28 },
  currentValue: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.saddle,
    marginBottom: 14,
  },
  submit: { marginTop: 4 },
});
