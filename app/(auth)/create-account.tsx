import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { CheckEmailNotice } from '@/src/components/CheckEmailNotice';
import * as Linking from 'expo-linking';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';

// Built 2026-07-25: this used to assume the Supabase project had
// "Confirm email" turned off entirely, specifically because there was no
// deep-link handler to receive the confirmation redirect - see
// app/confirm-email.tsx, which now exists to receive it.
// emailRedirectTo below points there. Once that's done, "Confirm email"
// can actually be turned on in the Supabase dashboard (Authentication ->
// Settings) - this code already handles the !data.session branch
// correctly either way, so nothing else here needs to change when it is.
export default function CreateAccount() {
  const { role } = useLocalSearchParams<{ role: string }>();
  const [email, setEmail] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Set once signUp succeeds but no session came back (email confirmation
  // pending) - swaps the form for the standard check-your-email notice
  // instead of a toast that disappears in a second.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  async function handleCreate() {
    if (!email.trim() || password.length < 8) {
      showToast('Enter an email and an 8+ character password');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: Linking.createURL('confirm-email') },
    });
    setLoading(false);

    if (error) {
      showToast(error.message);
      return;
    }

    if (!data.session) {
      setAwaitingConfirm(true);
      return;
    }

    if (role === 'clinician') {
      // An instructor has no athlete profile to set up: straight to the clinic and school profile.
      router.replace({ pathname: '/producer', params: { kind: 'clinician' } });
    } else if (role === 'lodging') {
      // A layover spot or hotel owner has no athlete profile either: straight to the lodging profile.
      router.replace({ pathname: '/producer', params: { kind: 'lodging' } });
    } else if (role === 'producer') {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/sign-up');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Create Account" subtitle="Sets up your login - your profile comes next" onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {awaitingConfirm ? (
          <>
            <CheckEmailNotice email={email.trim()} />
            <Button label="I've confirmed - sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </>
        ) : null}
        {awaitingConfirm ? null : <Text style={styles.helper}>This is what you'll use to sign back in to Steer Me. To finish your profile you'll need your Global Handicap card - a screenshot is fine, and it takes about two minutes.</Text>}
        {awaitingConfirm ? null : <>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          placeholder="At least 8 characters"
        />
        <Button label="Create account" onPress={handleCreate} loading={loading} style={styles.submit} />
        </>}
      </ScrollView>
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="create-account" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17 },
  submit: { marginTop: 8 },
});
