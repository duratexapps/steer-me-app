import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';

// Marketing-style feature carousel for anonymous visitors - deliberately
// separate from the in-app "Replay Tutorial" walkthroughs that exist
// elsewhere in the app (e.g. Producer Event Setup on the Draw Pro side),
// which are step-by-step form instructions for logged-in users, not a
// pitch for new visitors. Named "Take Tour" in the UI, not "tutorial",
// to keep the two concepts from blurring together.
//
// UPDATED 2026-07-27: added a real screen preview + "what to notice"
// hints per slide, replacing the icon-only version - same direct
// feedback ("just stuff to read") that prompted the same fix on Draw
// Pro's own tour (see ropingtools-site's docs/ARCHITECTURE.md 2026-07-27
// entries). Images are static mockups of this app's REAL screens
// (app/(tabs)/browse.tsx, app/events.tsx, app/(tabs)/post.tsx and their
// PartnerCard/EventCard/NeedPostCard components), built and screenshotted
// for this purpose - see ropingtools-site's
// docs/mockups/steer-me/*.html for the source and reasoning (a static
// mockup rather than screenshotting the live running app, per explicit
// direction, to avoid getting blocked on app-boot/env/seed-data issues).
const SLIDES = [
  {
    icon: 'people-outline' as const,
    image: require('@/assets/tour/browse.png'),
    title: 'Find Your Own Partner',
    body: 'Browse ropers by classification and event, message them directly, and skip the ~$40 draw-in fee producers charge for a blind draw.',
    hints: [
      'Filter by classification cap, or toggle on nearby-now location.',
      'Report/Block are one tap away on every card, not buried in a menu.',
    ],
  },
  {
    icon: 'calendar-outline' as const,
    image: require('@/assets/tour/events.png'),
    title: "See What's Coming Up",
    body: 'Events cross-posted straight from Draw Pro show up here automatically - mark yourself attending and see who else is going.',
    hints: [
      'See real attendance counts per division before you commit.',
      '"Partners" jumps straight into Browse, pre-filtered to that event.',
    ],
  },
  {
    icon: 'enter-outline' as const,
    image: require('@/assets/tour/enter-draw.png'),
    title: 'Enter the Draw, Right From Here',
    body: "Once you've got a partner - or decide to draw in solo - tap straight through into the producer's real entry page. No separate link to go find.",
    hints: [
      'One button on the event card - no separate link to go hunt down.',
      'Works whether you found a partner here or are drawing in solo.',
    ],
  },
  {
    icon: 'megaphone-outline' as const,
    image: require('@/assets/tour/post.png'),
    title: 'Post What You Need',
    body: "Can't find a partner in Browse? Post what you're looking for and let ropers come to you instead.",
    hints: [
      'Ties your post to the real event, so others can judge the schedule.',
      '"Listed event" means it’s a real Draw Pro/Steer Me event, not just a claim.',
    ],
  },
];

export default function Tour() {
  const [index, setIndex] = useState(0);
  const onLastSlide = index === SLIDES.length - 1;

  function skip() {
    router.replace('/(auth)/role-select');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="How Steer Me Works" onBack={() => router.back()} />
      <View style={styles.content}>
        <Pressable style={styles.skip} onPress={skip} hitSlop={10}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        {/* ScrollView, not a plain View, now that a slide includes a
            screen preview image - a real overflow bug was found and
            fixed on Draw Pro's equivalent tour once its slides got
            taller than a small-phone viewport (see ropingtools-site's
            docs/ARCHITECTURE.md 2026-07-27 entry); scrolling here avoids
            the same class of problem rather than waiting to hit it. */}
        <ScrollView style={styles.slideScroll} contentContainerStyle={styles.slide} showsVerticalScrollIndicator={false}>
          <Image source={SLIDES[index].image} style={styles.screenshot} resizeMode="contain" />
          <View style={styles.iconCircle}>
            <Ionicons name={SLIDES[index].icon} size={28} color={colors.bone} />
          </View>
          <Text style={styles.title}>{SLIDES[index].title}</Text>
          <Text style={styles.body}>{SLIDES[index].body}</Text>
          <View style={styles.hints}>
            {SLIDES[index].hints.map((hint) => (
              <Text key={hint} style={styles.hintText}>{'→ '}{hint}</Text>
            ))}
          </View>
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View key={slide.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {onLastSlide ? (
          <View style={styles.ctaRow}>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(auth)/role-select')}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(auth)/sign-in')}>
              <Text style={styles.secondaryBtnText}>Already have an account? Sign in</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.navRow}>
            {index > 0 ? (
              <Pressable style={styles.navBtn} onPress={() => setIndex(index - 1)}>
                <Text style={styles.navBtnText}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.navBtn} />
            )}
            <Pressable style={[styles.navBtn, styles.navBtnPrimary]} onPress={() => setIndex(index + 1)}>
              <Text style={styles.navBtnPrimaryText}>Next</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { flex: 1, padding: spacing.xl },
  skip: { alignSelf: 'flex-end', padding: spacing.sm },
  skipText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.saddle },
  // CHANGED 2026-07-27: was `flex: 1, justifyContent: 'center'` for a
  // plain View - now the contentContainerStyle of a ScrollView (see
  // render above), so it needs to size to its own content instead of
  // stretching/centering in the remaining space. flexGrow: 1 lets short
  // content still center-ish via the wrapping ScrollView while long
  // content (image + hints) scrolls instead of clipping.
  slideScroll: { flex: 1 },
  slide: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  screenshot: {
    width: '100%',
    height: 260,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.saddle,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.circle,
    backgroundColor: colors.espresso,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  hints: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  hintText: { fontFamily: fonts.body, fontSize: 13, color: colors.saddle, lineHeight: 18 },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.espresso,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.saddle,
    textAlign: 'center',
    lineHeight: 21,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: radii.circle, backgroundColor: colors.tan },
  dotActive: { backgroundColor: colors.brass, width: 20 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  navBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.saddle },
  navBtnPrimary: { backgroundColor: colors.espresso, borderRadius: radii.lg },
  navBtnPrimaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.bone },
  ctaRow: { gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.espresso,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bone },
  secondaryBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.espresso,
    textDecorationLine: 'underline',
  },
});
