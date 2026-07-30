import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSessionStore } from '@/src/state/session-store';
import { BackToRopingToolsLink } from '@/src/components/ui/BackToRopingToolsLink';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';

// REWRITTEN 2026-07-30 - real SEO gap flagged directly by the user: this
// route used to be an unconditional <Redirect> straight into either the
// signed-in app or the signup flow, for every single visitor including a
// search crawler - meaning the actual public homepage (steerme.
// ropingtools.com/) had zero real, indexable content. Wix's own SEO tools
// only ever covered the Draw Pro/ropingtools.com side (a separate Wix
// site) - Steer Me is a standalone Vercel deployment Wix has no reach
// into at all, so this page is the ONLY place Steer Me's own on-site SEO
// can live.
//
// Now: a real marketing landing page renders immediately (see
// _layout.tsx's matching change - this route is exempted from the
// fonts/session loading gate so it isn't blocked behind an async check
// the way the rest of the app still correctly is), and redirects into the
// real app ONLY once a genuine signed-in session is confirmed. A crawler,
// or anyone not signed in, sees real content - not a redirect to a login
// wall.
export default function Landing() {
  const session = useSessionStore((s) => s.session);
  const isReady = useSessionStore((s) => s.isReady);

  // Preserves the exact previous behavior for an actual returning,
  // signed-in user - once the session check resolves and confirms a real
  // session, bounce straight into the app, same as before. Until then
  // (or for anyone with no session at all, including every crawler),
  // the real landing content below is what renders.
  if (isReady && session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Head>
        {/* Google Search Console ownership verification for the
            https://steerme.ropingtools.com/ property - added 2026-07-30.
            Per Google's own instructions: must stay in place even after
            verification succeeds, or the property reverts to unverified. */}
        <meta name="google-site-verification" content="j8CD9Wxa_wAyzFAx2maS37iDQ-7QAmQMTSnjPKsyYnc" />
        <title>Steer Me — Team Roping Partner App | Find Ropings &amp; Partners</title>
        <meta
          name="description"
          content="Steer Me is the team roping partner app that helps you find ropings and partners near you. Match by classification number, browse real events posted by real producers, and skip the draw-in fee by finding your own partner."
        />
        <link rel="canonical" href="https://steerme.ropingtools.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Steer Me" />
        <meta property="og:title" content="Steer Me — Team Roping Partner App | Find Ropings & Partners" />
        <meta
          property="og:description"
          content="Find your own team roping partner and browse real ropings near you. Match by classification number, skip the draw-in fee, and enter with confidence."
        />
        <meta property="og:url" content="https://steerme.ropingtools.com/" />
        <meta property="og:image" content="https://steerme.ropingtools.com/logo.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Steer Me — Team Roping Partner App" />
        <meta
          name="twitter:description"
          content="Find your own team roping partner and browse real ropings near you."
        />
        <meta name="twitter:image" content="https://steerme.ropingtools.com/logo.png" />
        {/* Structured data so search engines understand this is a real app,
            not just a generic web page - SoftwareApplication is the
            schema.org type Google's own docs point to for app listings. */}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Steer Me',
            applicationCategory: 'SportsApplication',
            operatingSystem: 'iOS, Android, Web',
            description:
              'Steer Me is a team roping partner app that helps ropers find ropings and partners near them, matched by classification number.',
            url: 'https://steerme.ropingtools.com/',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          })}
        </script>
      </Head>

      <BackToRopingToolsLink />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="contain" />
          {/* Real H1 (RN Text renders as a <p> on web by default, but the
              content itself - the actual words - is what search engines
              read; visual hierarchy is handled by size/weight here) -
              leads with the core keyword phrase itself. */}
          <Text style={styles.h1} accessibilityRole={Platform.OS === 'web' ? ('heading' as never) : undefined}>
            The Team Roping Partner App
          </Text>
          <Text style={styles.tagline}>Find ropings and partners near you. Skip the ~$40 draw-in fee.</Text>
        </View>

        <View style={styles.ctaRow}>
          <Button label="Get Started" onPress={() => router.push('/(auth)/role-select')} style={styles.ctaBtn} />
          <Pressable onPress={() => router.push('/(auth)/sign-in')} style={styles.signInLink}>
            <Text style={styles.signInLinkText}>Already have an account? Sign in</Text>
          </Pressable>
        </View>

        <View style={styles.features}>
          <Feature
            title="Find a real roping partner"
            body="Steer Me matches you with header/heeler partners by classification (handicap) number, so every match is a fair, legal team from the start - no more scrambling at the gate."
          />
          <Feature
            title="Browse real ropings near you"
            body="See real events posted by real producers - dates, entry fees, divisions, and driving distance from your own home area - so you know what's worth the trip before you commit."
          />
          <Feature
            title="Enter with confidence"
            body="Once you've got a partner, hand off straight into Draw Pro's entry form with your info already filled in - no retyping, no confusion about who's paired with who."
          />
          <Feature
            title="Built for real ropers, by real ropers"
            body="Steer Me exists because finding a partner shouldn't cost you a draw-in fee or a wasted trip. It's free to browse, free to match, and built specifically for team roping."
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Part of the RopingTools family, alongside Draw Pro.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.featureCard}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: {
    padding: 20,
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 8 },
  logo: { width: 88, height: 88, marginBottom: 12 },
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
    marginTop: 10,
    lineHeight: 21,
    maxWidth: 480,
  },
  ctaRow: { alignItems: 'center', marginTop: 26, marginBottom: 8 },
  ctaBtn: { minWidth: 220 },
  signInLink: { marginTop: 14, cursor: 'pointer' },
  signInLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.brass,
    textDecorationLine: 'underline',
  },
  features: { marginTop: 34, gap: 14 },
  featureCard: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderRadius: radii.lg,
    padding: 16,
  },
  featureTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.espresso, marginBottom: 6 },
  featureBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  footer: { alignItems: 'center', marginTop: 36 },
  footerText: { fontFamily: fonts.body, fontSize: 12, color: colors.saddle },
});
