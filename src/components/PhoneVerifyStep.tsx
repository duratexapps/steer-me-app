import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

type Props = {
  // Called once the phone is confirmed.
  onVerified: () => void;
  verified: boolean;
};

// Turns a typed US number into E.164 (+1XXXXXXXXXX). Returns null if it does not look like a US mobile number.
export function toE164US(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// One-time text-message code for a roper who has no Global card. Uses Supabase's built-in phone verification
// on the signed-in account (updateUser to add the phone, then verifyOtp 'phone_change'). The text is only sent
// when this component is shown, which the sign-up screen does only for no-card ropers and only when the
// requirement is switched on (migration 0094, app_settings.require_phone_for_unverified).
export function PhoneVerifyStep({ onVerified, verified }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const e164 = toE164US(phone);
    if (!e164) {
      showToast('Enter a 10-digit US mobile number');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: e164 });
    setBusy(false);
    if (error) {
      showToast(error.message.toLowerCase().includes('already') ? 'That number is already used by another account' : 'Could not send the code - try again in a minute');
      return;
    }
    setSent(true);
    showToast('Code sent');
  }

  async function checkCode() {
    const e164 = toE164US(phone);
    if (!e164 || code.trim().length < 4) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'phone_change' });
    setBusy(false);
    if (error) {
      showToast('That code is not right or has expired');
      return;
    }
    showToast('Phone verified');
    onVerified();
  }

  if (verified) {
    return <Text style={styles.done}>✓ Phone verified</Text>;
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Verify your phone</Text>
      <Text style={styles.note}>
        Because you're signing up without a Global card, we text you a one-time code to confirm you're a real person.
        By tapping Send code you agree to receive that one text from Steer Me. Message and data rates may apply; we
        use your number only to verify your account.
      </Text>
      <TextField label="Mobile number" value={phone} onChangeText={setPhone} placeholder="(555) 555-0134" keyboardType="phone-pad" textContentType="telephoneNumber" />
      {!sent ? (
        <Button label="Send code" onPress={sendCode} loading={busy} />
      ) : (
        <>
          <TextField label="6-digit code" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" />
          <Button label="Confirm code" onPress={checkCode} loading={busy} />
          <Text style={styles.resend} onPress={sendCode}>
            Send a new code
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderColor: colors.brass, borderRadius: 12, padding: 14, backgroundColor: colors.tanLight, marginBottom: 14 },
  title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.espresso, marginBottom: 4 },
  note: { fontFamily: fonts.body, fontSize: 11.5, color: colors.saddle, lineHeight: 16, marginBottom: 10 },
  done: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.green, marginBottom: 14 },
  resend: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass, textDecorationLine: 'underline', marginTop: 10 },
});
