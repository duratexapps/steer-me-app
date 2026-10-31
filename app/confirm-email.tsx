import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';
import { parseAuthLink, useIncomingAuthUrl } from '@/src/lib/auth-link';
import { reportError } from '@/src/lib/error-reporting';

// Landing screen for Supabase's email-confirmation link (create-account.tsx sets emailRedirectTo to point here).
//
// REWRITTEN 2026-10-31 after the platform audit. Supabase redirects here in one of three shapes:
//  - a `code` query param (PKCE flow): exchanged for a session;
//  - access_token/refresh_token in the URL fragment (implicit flow, what this project uses): read with parseAuthLink;
//  - an error in the fragment (#error_code=otp_expired ...) when the link was already used or has expired. Email
//    scanners can use a link before the person taps it, so "expired" very often means "already confirmed".
// Fixed here: the link is read from the latest incoming URL, so it works when the app was already open (it used to read
// only the URL the app was launched with); a used or expired link gets a plain explanation instead of "missing required
// information"; and any exception ends in the error state instead of an endless spinner.
export default function ConfirmEmail() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const url = useIncomingAuthUrl();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [title, setTitle] = useState("That link didn't work");
  const [message, setMessage] = useState('');
  const [waited, setWaited] = useState(false);
  const handled = useRef(false);

  // On a phone the URL can arrive a moment after this screen opens; give it a couple of seconds before giving up.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (handled.current) return;

    async function fail(t: string, m: string) {
      handled.current = true;
      setTitle(t);
      setMessage(m);
      setStatus('error');
    }

    async function run() {
      try {
        if (code) {
          handled.current = true;
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return fail("Couldn't confirm your email", error.message);
        } else {
          const link = parseAuthLink(url);
          if (link.errorCode) {
            const used = link.errorCode === 'otp_expired' || /expired|invalid/i.test(link.errorDescription ?? '');
            return fail(
              used ? 'This link was already used or has expired' : "That link didn't work",
              used
                ? "If you already tapped it once, your email is confirmed: just sign in. If not, sign in and we'll offer to send you a new link."
                : (link.errorDescription ?? 'Please sign in and we will help you from there.')
            );
          }
          if (!link.tokens) {
            if (!waited) return; // the link may still be arriving; this effect runs again when it does
            return fail(
              "We couldn't read that link",
              "Your email may already be confirmed. Sign in, and if it says to confirm your email first, we'll send you a new link."
            );
          }
          handled.current = true;
          const { error } = await supabase.auth.setSession(link.tokens);
          if (error) return fail("Couldn't confirm your email", error.message);
        }
        showToast('Email confirmed - signing you in.');
        // onAuthStateChange (wired up in app/_layout.tsx) picks the new session up; this just leaves the screen.
        router.replace('/');
      } catch (err) {
        void reportError(err, { context: 'confirm-email' });
        await fail("Couldn't confirm your email", 'Something went wrong on our end. Your email may already be confirmed: try signing in.');
      }
    }

    void run();
  }, [code, url, waited]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {status === 'working' ? (
          <>
            <ActivityIndicator color={colors.brass} size="large" />
            <Text style={styles.text}>Confirming your email...</Text>
          </>
        ) : (
          <>
            <Text style={styles.errorTitle}>{title}</Text>
            <Text style={styles.text}>{message}</Text>
            <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} style={styles.button} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, textAlign: 'center', lineHeight: 20 },
  errorTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, textAlign: 'center' },
  button: { marginTop: 12 },
});
