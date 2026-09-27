import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';

// NEW 2026-09-27 - dedicated QR-code landing page, distinct from the SEO
// homepage (app/index.tsx). Real ask: physical-world QR codes on shirts and
// trailer decals need a fast, minimal destination purpose-built for "I just
// scanned this on my phone" - not the full marketing homepage with its
// scroll of feature copy. This is the one URL printed on physical media, so
// it needs to stay put at /get indefinitely once anything's been printed.
const APP_STORE_URL = 'https://apps.apple.com/app/id6805227345';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.duratexapplications.steerme';

export default function Get() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Head>
        <title>Get Steer Me — Download for iPhone &amp; Android</title>
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://steerme.ropingtools.com/get" />
      </Head>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="contain" />
          <Text style={styles.h1}>Get Steer Me</Text>
          <Text style={styles.tagline}>The team roping partner app. Free to download.</Text>
        </View>

        <Pressable style={styles.tourBtn} onPress={() => router.push('/tour')}>
          <Ionicons name="play-circle-outline" size={20} color={colors.espresso} />
          <Text style={styles.tourBtnText}>See How It Works</Text>
        </Pressable>

        <View style={styles.storeRow}>
          <Pressable style={styles.storeBtn} onPress={() => Linking.openURL(APP_STORE_URL)}>
            <Ionicons name="logo-apple" size={30} color={colors.bone} />
            <View style={styles.storeBtnText}>
              <Text style={styles.storeBtnSmall}>Download on the</Text>
              <Text style={styles.storeBtnBig}>App Store</Text>
            </View>
          </Pressable>

          <Pressable style={styles.storeBtn} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
            <Ionicons name="logo-google-playstore" size={26} color={colors.bone} />
            <View style={styles.storeBtnText}>
              <Text style={styles.storeBtnSmall}>Get it on</Text>
              <Text style={styles.storeBtnBig}>Google Play</Text>
            </View>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/')} style={styles.webLink}>
          <Text style={styles.webLinkText}>Prefer your browser? Continue to steerme.ropingtools.com</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 96, height: 96, marginBottom: spacing.md },
  h1: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.espresso,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15.5,
    color: colors.saddle,
    textAlign: 'center',
    marginTop: 8,
  },
  tourBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.espresso,
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginBottom: spacing.lg,
  },
  tourBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.espresso },
  storeRow: { gap: spacing.md },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.espresso,
    borderRadius: radii.lg,
    paddingVertical: 14,
  },
  storeBtnText: { alignItems: 'flex-start' },
  storeBtnSmall: { fontFamily: fonts.body, fontSize: 10.5, color: colors.tan },
  storeBtnBig: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.bone, marginTop: -1 },
  webLink: { marginTop: spacing.xl, alignItems: 'center' },
  webLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.brass,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
