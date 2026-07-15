import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

// Necessary addition beyond the prototype: it has no real authentication at
// all. This assumes the Supabase project has "Confirm email" turned off
// (see supabase/RUNBOOK.md) so signUp returns an active session immediately
// and the flow can continue straight into profile setup, rather than
// stalling on an email-confirmation deep link this app doesn't implement.
export default function CreateAccount() {
  const { role } = useLocalSearchParams<{ role: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!email.trim() || password.length < 8) {
      showToast('Enter an email and an 8+ character password');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
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
      <ScreenHeader title="Create Account" subtitle="Sets up your login - your profile comes next" onBack={() => router.back()} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20 },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: '#6b5c47', marginBottom: 16, lineHeight: 17 },
  submit: { marginTop: 8 },
});
