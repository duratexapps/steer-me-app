import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts } from '@/src/theme/theme';
import { useCreateCogginsShare } from '@/src/hooks/useHorseDocuments';
import { showToast } from '@/src/state/toast-store';

const SHARE_BASE_URL = 'https://steerme.ropingtools.com/coggins';

function secondsRemaining(expiresAt: string) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

// Full-screen QR display for the "Show at the gate" flow (see
// my-horses.tsx). Deliberately regenerates a brand-new token on every
// visit here AND every "Generate a new link" tap - a token is only ever
// meant to work for the ~30 minutes right after it's created, not sit
// around reusable, so there's no "keep the old one" path anywhere in this
// screen.
export default function ShowCoggins() {
  const params = useLocalSearchParams<{ token: string; expiresAt: string }>();
  const [token, setToken] = useState(params.token);
  const [expiresAt, setExpiresAt] = useState(params.expiresAt);
  const [remaining, setRemaining] = useState(secondsRemaining(params.expiresAt));
  const createShare = useCreateCogginsShare();

  useEffect(() => {
    const interval = setInterval(() => setRemaining(secondsRemaining(expiresAt)), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleRegenerate() {
    try {
      const share = await createShare.mutateAsync();
      setToken(share.token);
      setExpiresAt(share.expires_at);
      setRemaining(secondsRemaining(share.expires_at));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create a new link');
    }
  }

  const expired = remaining <= 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const url = `${SHARE_BASE_URL}/${token}`;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Show at the Gate" subtitle="Have staff scan this - no login needed on their end" onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.qrWrap}>
          {expired ? (
            <View style={styles.expiredBox}>
              <Text style={styles.expiredText}>This link has expired</Text>
            </View>
          ) : (
            <QRCode value={url} size={240} backgroundColor={colors.bone} color={colors.espresso} />
          )}
        </View>
        <Text style={styles.timer}>
          {expired ? 'Generate a new one to keep sharing' : `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`}
        </Text>
        <Button
          label={createShare.isPending ? 'Generating...' : 'Generate a new link'}
          variant={expired ? 'primary' : 'outline'}
          onPress={handleRegenerate}
          loading={createShare.isPending}
          style={{ marginTop: 20 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrWrap: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bone,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: 16,
  },
  expiredBox: { padding: 20, alignItems: 'center' },
  expiredText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.oxblood, textAlign: 'center' },
  timer: { fontFamily: fonts.mono, fontSize: 15, color: colors.saddle, marginTop: 16 },
});
