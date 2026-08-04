import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

// Landing page for "Forgot password?" on sign-in.tsx. Sends a Supabase
// recovery email pointing at reset-password.tsx (see that file's own
// comment for how the actual link-back is handled) - same
// Linking.createURL() idiom create-account.tsx already uses for its own
// confirmation email, so this resolves correctly on native (steerme://...)
// and web (a real https origin) without needing to know which one ahead
// of time.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      showToast('Enter your email');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('reset-password'),
    });
    setLoading(false);

    // Shown as "sent" either way, even on a real error - confirming or
    // denying whether an email address has an account here would let
    // someone enumerate registered emails. The error is still logged for
    // real debugging, just never surfaced to the person typing.
    if (error) {
      console.error('[forgot-password] resetPasswordForEmail failed', error.message);
    }
    setSent(true);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Reset Password" subtitle="We'll email you a link" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {sent ? (
          <Text style={styles.confirmText}>
            If an account exists for {email.trim()}, a password reset link is on its way. Check your email.
          </Text>
        ) : (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
            <Button label="Send reset link" onPress={handleSend} loading={loading} style={styles.submit} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  submit: { marginTop: 8 },
  confirmText: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, lineHeight: 20 },
});
