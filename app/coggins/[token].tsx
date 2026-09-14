import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii } from '@/src/theme/theme';
import { formatDateDisplay } from '@/src/lib/date';

type SharedHorse = {
  id: string;
  horse_name: string;
  description: string | null;
  test_date: string | null;
  image_url: string | null;
};

// The anonymous-viewer half of the "Show at the gate" flow (see
// my-horses.tsx / show-coggins.tsx). Reachable with zero login - event
// staff scanning a roper's QR code have no Steer Me account at all - so
// this deliberately does NOT use the shared authenticated ScreenHeader
// (back button, help, report-issue link all assume an app session that
// doesn't exist here) and calls the Edge Function with a plain fetch, not
// the Supabase client, since there's no session for that client to carry
// either. See _layout.tsx's PUBLIC_ROUTES for why this route renders
// immediately instead of sitting behind the app's normal fonts/session
// wait.
export default function CogginsShare() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [horses, setHorses] = useState<SharedHorse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-coggins-share?token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error === 'expired' ? 'expired' : 'error');
          return;
        }
        setHorses(body.horses as SharedHorse[]);
      } catch {
        if (!cancelled) setError('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Steer Me</Text>
        <Text style={styles.headerSub}>Coggins Verification</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error === 'expired' ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>This link has expired</Text>
            <Text style={styles.stateBody}>
              Ask the roper to generate a fresh one - "Show at the gate" links are only good for a short
              window and a new one takes just a tap.
            </Text>
          </View>
        ) : error === 'error' ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>Couldn't load this link</Text>
            <Text style={styles.stateBody}>Ask the roper to try generating a new one.</Text>
          </View>
        ) : horses === null ? (
          <ActivityIndicator color={colors.brass} style={{ marginTop: 40 }} />
        ) : horses.length === 0 ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>No documents on file</Text>
          </View>
        ) : (
          horses.map((h) => (
            <View key={h.id} style={styles.card}>
              <Text style={styles.horseName}>{h.horse_name}</Text>
              {h.description ? <Text style={styles.horseMeta}>{h.description}</Text> : null}
              <Text style={styles.horseMeta}>{h.test_date ? `Tested ${formatDateDisplay(h.test_date)}` : 'No test date on file'}</Text>
              {h.image_url ? <Image source={{ uri: h.image_url }} style={styles.image} resizeMode="contain" /> : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  header: { backgroundColor: colors.espresso, padding: 20, paddingTop: 30 },
  headerTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.bone, letterSpacing: 1, textTransform: 'uppercase' },
  headerSub: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.saddle, marginTop: 2 },
  content: { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  stateBox: { marginTop: 40, alignItems: 'center' },
  stateTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.espresso, textAlign: 'center' },
  stateBody: { fontFamily: fonts.body, fontSize: 13, color: colors.saddle, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  card: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 14,
  },
  horseName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.espresso },
  horseMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.saddle, marginTop: 2 },
  image: { width: '100%', height: 320, borderRadius: radii.md, marginTop: 10, backgroundColor: colors.tan },
});
