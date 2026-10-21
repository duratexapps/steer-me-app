import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { useSessionStore } from '@/src/state/session-store';
import { logFeature, type TravelFeature } from '@/src/lib/feature-log';
import { setPostAuthRedirect } from '@/src/lib/post-auth-redirect';

// The travel tools are free for registered Steer Me members and need a signed-in account (the database enforces it
// too). Signed-out visitors see this wall instead of the tool: what it is, that it is free, and two buttons.
// A signed-out visit is counted anonymously ('gate_shown') so we can see how many people the wall turns into sign-ups.

type Props = {
  feature: TravelFeature;
  path: string;
  title: string;
  pitch: string;
  headTitle: string;
  headDescription: string;
  children: ReactNode;
};

export function MembersGate({ feature, path, title, pitch, headTitle, headDescription, children }: Props) {
  const isReady = useSessionStore((s) => s.isReady);
  const signedIn = useSessionStore((s) => !!s.session);

  useEffect(() => {
    if (isReady && !signedIn) logFeature(feature, 'gate_shown');
  }, [isReady, signedIn, feature]);

  if (isReady && signedIn) return <>{children}</>;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Head>
        <title>{headTitle}</title>
        <meta name="description" content={headDescription} />
      </Head>
      <ScrollView contentContainerStyle={styles.content}>
        {isReady ? (
          <View>
            <Text style={styles.eyebrow}>STEER ME · FREE FOR MEMBERS</Text>
            <Text style={styles.h1}>{title}</Text>
            <Text style={styles.pitch}>{pitch}</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Free with a Steer Me account</Text>
              <Text style={styles.cardBody}>
                It costs nothing and does not need a subscription. Create your free account, or sign in if you already have one.
              </Text>
              <Button label="Create a free account" onPress={() => router.push('/(auth)/role-select')} style={styles.btn} />
              <Button
                label="I already have an account"
                variant="outline"
                onPress={() => {
                  setPostAuthRedirect(path);
                  router.push('/(auth)/sign-in');
                }}
                style={styles.btn}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.pitch}>Loading…</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: 60 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, color: colors.brass, marginBottom: 8 },
  h1: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.espresso, marginBottom: 8 },
  pitch: { fontFamily: fonts.body, fontSize: 14, color: colors.saddle, lineHeight: 20, marginBottom: 16 },
  card: { backgroundColor: colors.tanLight, borderWidth: 1, borderColor: colors.saddle, borderRadius: radii.md, padding: 16 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.espresso },
  cardBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.espresso, lineHeight: 19, marginTop: 6, marginBottom: 6 },
  btn: { marginTop: 10 },
});
