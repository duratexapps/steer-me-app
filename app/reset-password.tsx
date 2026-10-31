import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { parseAuthLink, useIncomingAuthUrl } from '@/src/lib/auth-link';
import { PASSWORD_HINT, passwordProblem } from '@/src/lib/password-rules';
import { reportError } from '@/src/lib/error-reporting';

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

  const url = useIncomingAuthUrl();
  const [waited, setWaited] = useState(false);
  const handled = useRef(false);

  // The link can arrive a moment after this screen opens (and, if the app was already open, only as a later URL event).
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (handled.current) return;

    function fail(m: string) {
      handled.current = true;
      setErrorMessage(m);
      setStatus('error');
    }

    async function run() {
      try {
        if (code) {
          handled.current = true;
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return fail(error.message);
        } else {
          const link = parseAuthLink(url);
          if (link.errorCode) {
            return fail('This reset link was already used or has expired. Request a new one from the sign-in screen.');
          }
          if (!link.tokens) {
            if (!waited) return;
            return fail('This reset link is missing required information. Request a new one from the sign-in screen.');
          }
          handled.current = true;
          const { error } = await supabase.auth.setSession(link.tokens);
          if (error) return fail(error.message);
        }
        setStatus('ready');
      } catch (err) {
        void reportError(err, { context: 'reset-password' });
        fail('Something went wrong on our end. Request a new reset link from the sign-in screen.');
      }
    }

    void run();
  }, [code, url, waited]);

  async function handleSave() {
    const problem = passwordProblem(password);
    if (problem) {
      showToast(problem);
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
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.errorTitle}>Set a new password</Text>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            placeholder={PASSWORD_HINT}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  formContent: { padding: 20, paddingTop: 60, gap: 4, ...webMaxWidth },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, textAlign: 'center' },
  errorTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, textAlign: 'center', marginBottom: 8 },
  button: { marginTop: 12 },
});
