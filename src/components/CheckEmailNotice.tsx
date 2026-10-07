import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

// The one standard "go confirm your email" message, shown wherever a person
// is waiting on a confirmation email: right after Create Account, and on
// Sign In when the login is rejected as unconfirmed. Added 2026-10-06 after
// an audit found 11 of 40 real sign-ups never confirmed - the old flow was a
// one-second toast followed by a redirect, with no mention of spam and no
// way to ask for another email. Keep the wording here in one place so the
// app, the confirmation email template and any outreach all say the same
// thing.
export const CHECK_EMAIL_SPAM_LINE =
  "Don't see it? Check your spam or junk folder, and look for a message from Steer Me (noreply@ropingtoolsmail.com). It can take a couple of minutes.";

export function CheckEmailNotice({ email, title = 'Check your email' }: { email: string; title?: string }) {
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: Linking.createURL('confirm-email') },
    });
    setSending(false);
    showToast(error ? error.message : 'Sent again - check your inbox and spam folder');
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        We sent a confirmation link to <Text style={styles.bold}>{email}</Text>. Tap it, then come back here and sign in.
      </Text>
      <Text style={styles.body}>{CHECK_EMAIL_SPAM_LINE}</Text>
      <Button label="Send it again" variant="outline" onPress={resend} loading={sending} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.md,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  title: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.espresso },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.espresso, lineHeight: 18 },
  bold: { fontFamily: fonts.bodyBold },
  btn: { marginTop: 4 },
});
