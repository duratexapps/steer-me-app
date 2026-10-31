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
import { PASSWORD_HINT, passwordProblem } from '@/src/lib/password-rules';
import { DividerNote } from '@/src/components/ui/DividerNote';

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

  // A typo in the email (gmial.com) makes a permanent dead account: the confirmation goes nowhere and the person never learns why.
  const [suggestion, setSuggestion] = useState<string | null>(null);

  function typoSuggestion(value: string): string | null {
    const [local, domain] = value.toLowerCase().split('@');
    if (!local || !domain) return null;
    const fixes: Record<string, string> = {
      'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com',
      'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com',
      'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
      'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com', 'aol.con': 'aol.com', 'comcast.nte': 'comcast.net',
    };
    return fixes[domain] ? `${local}@${fixes[domain]}` : null;
  }

  async function handleCreate(skipTypoCheck = false) {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      showToast('Enter your email address');
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      showToast(problem);
      return;
    }
    const fix = skipTypoCheck ? null : typoSuggestion(trimmed);
    if (fix) {
      setSuggestion(fix);
      return;
    }
    setSuggestion(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: { emailRedirectTo: Linking.createURL('confirm-email') },
    });
    setLoading(false);

    if (error) {
      if (error.code === 'over_email_send_rate_limit') showToast("We're sending a lot of emails right now. Please try again in a few minutes.");
      else if (error.code === 'weak_password') showToast(PASSWORD_HINT);
      else showToast(error.message);
      return;
    }

    // When an account with this email already exists, Supabase answers as if it worked but sends nothing (and returns a
    // user with no identities). Say so, instead of leaving the person waiting for an email that is never coming.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      showToast('That email already has a Steer Me account. Sign in, or use Forgot password if you need a new one.');
      router.replace('/(auth)/sign-in');
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
        {awaitingConfirm ? null : <Text style={styles.helper}>This is what you'll use to sign back in to Steer Me. Next is your roper profile. Have a Global Handicap card? A screenshot is fine. Don't have one? You're just as welcome: answer a few quick questions about how you rope instead. Either way it takes about two minutes.</Text>}
        {awaitingConfirm ? null : <>
        <TextField
          label="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setSuggestion(null); }}
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
          placeholder={PASSWORD_HINT}
        />
        <Text style={styles.hint}>Password: {PASSWORD_HINT.toLowerCase()}.</Text>
        {suggestion ? (
          <DividerNote>
            Did you mean <Text style={{ fontFamily: fonts.bodyBold }}>{suggestion}</Text>?{'  '}
            <Text style={styles.link} onPress={() => { setEmail(suggestion); setSuggestion(null); }}>Yes, use that</Text>
            {'   '}
            <Text style={styles.link} onPress={() => void handleCreate(true)}>No, it's right</Text>
          </DividerNote>
        ) : null}
        <Button label="Create account" onPress={() => void handleCreate()} loading={loading} style={styles.submit} />
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
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, marginTop: -8, marginBottom: 12 },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.saddle, textDecorationLine: 'underline' },
});
