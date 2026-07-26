import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

// Landing screen for Supabase's email-confirmation link (see
// create-account.tsx's signUp() call, which sets emailRedirectTo to
// point here). Built 2026-07-25 - "Confirm email" was previously left
// off in the Supabase project deliberately, specifically because this
// screen didn't exist yet (see that earlier comment in
// create-account.tsx, which should be revisited once "Confirm email" is
// actually turned on in the Supabase dashboard).
//
// Supabase can redirect here in either of two shapes depending on the
// project's Auth flow setting:
//  - PKCE flow (current Supabase default for new projects): a `code`
//    query param, exchanged via exchangeCodeForSession(). expo-router's
//    useLocalSearchParams() sees this fine, since it's a normal query
//    param.
//  - Implicit flow (older projects): access_token/refresh_token in the
//    URL's HASH fragment, not a query param - useLocalSearchParams()
//    can't see this, so it's parsed manually from the raw incoming URL
//    as a fallback.
// Handling both means this works regardless of which flow this specific
// Supabase project ends up configured for, without needing to know for
// certain ahead of time.
export default function ConfirmEmail() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStatus('error');
          setErrorMessage(error.message);
          return;
        }
      } else {
        // No `code` query param - check for implicit-flow hash tokens
        // instead, from whichever URL actually brought us here (cold
        // start vs. already-running gives different APIs for "the
        // current URL", so check both).
        const initialUrl = await Linking.getInitialURL();
        const tokens = parseHashTokens(initialUrl);
        if (!tokens) {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage('This confirmation link is missing required information. Try signing in directly instead.');
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

      showToast('Email confirmed - signing you in.');
      // onAuthStateChange (already wired up globally in app/_layout.tsx)
      // picks up the new session automatically from setSession()/
      // exchangeCodeForSession() above - this redirect just gets the
      // user off this intermediate screen once that's settled.
      router.replace('/');
    }

    confirm();
    return () => {
      cancelled = true;
    };
  }, [code]);

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
            <Text style={styles.errorTitle}>Couldn't confirm your email</Text>
            <Text style={styles.text}>{errorMessage}</Text>
            <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} style={styles.button} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// Supabase's implicit-flow redirect puts tokens after a `#`, e.g.
// steerme://confirm-email#access_token=xxx&refresh_token=yyy&type=signup -
// a real URL fragment, not a query string, so it has to be parsed
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
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, textAlign: 'center' },
  errorTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.espresso, textAlign: 'center' },
  button: { marginTop: 12 },
});
