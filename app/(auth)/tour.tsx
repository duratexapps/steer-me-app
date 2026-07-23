import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
const SLIDES = [
  {
    icon: 'people-outline' as const,
    title: 'Find Your Own Partner',
    body: 'Browse ropers by classification and event, message them directly, and skip the ~$40 draw-in fee producers charge for a blind draw.',
  },
  {
    icon: 'calendar-outline' as const,
    title: "See What's Coming Up",
    body: 'Events cross-posted straight from Draw Pro show up here automatically - mark yourself attending and see who else is going.',
  },
  {
    icon: 'enter-outline' as const,
    title: 'Enter the Draw, Right From Here',
    body: "Once you've got a partner - or decide to draw in solo - tap straight through into the producer's real entry page. No separate link to go find.",
  },
  {
    icon: 'megaphone-outline' as const,
    title: 'Post What You Need',
    body: "Can't find a partner in Browse? Post what you're looking for and let ropers come to you instead.",
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

        <View style={styles.slide}>
          <View style={styles.iconCircle}>
            <Ionicons name={SLIDES[index].icon} size={40} color={colors.bone} />
          </View>
          <Text style={styles.title}>{SLIDES[index].title}</Text>
          <Text style={styles.body}>{SLIDES[index].body}</Text>
        </View>

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
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radii.circle,
    backgroundColor: colors.espresso,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
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
