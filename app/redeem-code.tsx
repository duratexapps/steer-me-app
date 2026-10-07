import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { TextField } from '@/src/components/ui/TextField';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { supabase } from '@/src/lib/supabase';
import { goBackOrHome } from '@/src/lib/navigation';
import { showToast } from '@/src/state/toast-store';
import { useInvalidateSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';

const DURATION_TEXT: Record<string, string> = {
  daily: '1 day',
  monthly: '1 month',
  two_month: '2 months',
  three_month: '3 months',
  six_month: '6 months',
  yearly: '1 year',
};

// Redeem a single-use promo code for free subscription time (migration 0072,
// redeem-promo-code Edge Function). Works the same on web and mobile - it
// never touches the store billing SDK.
export default function RedeemCode() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidateStatus = useInvalidateSubscriptionStatus();

  async function handleRedeem() {
    if (!code.trim()) {
      setError('Enter your code.');
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('redeem-promo-code', { body: { code } });
    setLoading(false);
    if (fnError) {
      // FunctionsHttpError carries the response; surface the server's plain-language message.
      let message = 'Something went wrong. Please try again.';
      try {
        const body = await (fnError as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
      setError(message);
      return;
    }
    setDone(DURATION_TEXT[data?.duration] ?? 'free time');
    invalidateStatus();
    showToast('Code applied');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Redeem a Code" subtitle="Free subscription time" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content}>
        {done ? (
          <DividerNote>
            <Text style={{ fontFamily: fonts.bodyBold }}>You're set. </Text>
            {done} of free membership has been added to your account. Thanks for your patience.
          </DividerNote>
        ) : (
          <>
            <Text style={styles.helper}>Enter the code we sent you. Each code works once, on the account it was sent to.</Text>
            <TextField
              label="Code"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="STEER-XXXX-XXXX"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Redeem" onPress={handleRedeem} loading={loading} style={styles.submit} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  helper: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginBottom: 16, lineHeight: 17 },
  error: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.oxblood, marginBottom: 8 },
  submit: { marginTop: 8 },
});
