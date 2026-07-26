import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import * as Linking from 'expo-linking';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

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
      showToast('Check your email to confirm your account, then sign in');
      router.replace('/(auth)/sign-in');
      return;
    }

    if (role === 'producer') {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/sign-up');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Create Account" subtitle="Sets up your login - your profile comes next" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helper}>This is what you'll use to sign back in to Steer Me.</Text>
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
