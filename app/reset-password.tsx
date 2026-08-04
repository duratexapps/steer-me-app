import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

// Landing screen for Supabase's password-recovery link (see
// forgot-password.tsx's resetPasswordForEmail() call, which sets
// redirectTo to point here). Same two-shapes-depending-on-Auth-flow
// handling as confirm-email.tsx (PKCE `code` query param vs. implicit
// access_token/refresh_token in the URL hash) - copied deliberately
// rather than shared, since the two screens' post-session behavior
// differs (confirm-email signs straight in; this one still needs a new
// password before it's done).
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<'working' | 'ready' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStatus('error');
          setErrorMessage(error.message);
          return;
        }
      } else {
        const initialUrl = await Linking.getInitialURL();
        const tokens = parseHashTokens(initialUrl);
        if (!tokens) {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage('This reset link is missing required information. Request a new one from the sign-in screen.');
          return;
        }
        const { error } = await supabase.auth.setSession(tokens);
        if (cancelled) return;
        if (error) {
          setStatus('error');
          setErrorMessage(error.message);
          return;
        }
      }

      if (!cancelled) setStatus('ready');
    }

    establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSave() {
    if (password.length < 6) {
      showToast('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords don't match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      showToast(error.message);
      return;
    }
    showToast('Password updated - signing you in.');
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.screen}>
      {status === 'working' ? (
        <View style={styles.content}>
          <ActivityIndicator color={colors.brass} size="large" />
          <Text style={styles.text}>Verifying your reset link...</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.content}>
          <Text style={styles.errorTitle}>Couldn't reset your password</Text>
          <Text style={styles.text}>{errorMessage}</Text>
          <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} style={styles.button} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={styles.errorTitle}>Set a new password</Text>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            placeholder="At least 6 characters"
          />
          <TextField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            textContentType="newPassword"
            placeholder="Type it again"
          />
          <Button label="Save new password" onPress={handleSave} loading={saving} style={styles.button} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Supabase's implicit-flow redirect puts tokens after a `#`, e.g.
// steerme://reset-password#access_token=xxx&refresh_token=yyy&type=recovery
// - a real URL fragment, not a query string, so it has to be parsed
// manually rather than via expo-router's query-param parsing.
function parseHashTokens(url: string | null): { access_token: string; refresh_token: string } | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  formContent: { padding: 20, paddingTop: 60, gap: 4, ...webMaxWidth },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, textAlign: 'center' },
  errorTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, textAlign: 'center', marginBottom: 8 },
  button: { marginTop: 12 },
});
