import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { goBackOrHome } from '@/src/lib/navigation';

// Contestant-facing FAQ, public (reachable pre-login, same as legal.tsx) so
// a support reply can just be a link and so someone locked out of their
// account can still find an answer. Lives at steerme.ropingtools.com/faq on
// the web export - the counterpart to Draw Pro's own producer-facing FAQ at
// draw-pro-app's /faq, which covers running an event ON Draw Pro rather
// than using Steer Me as a contestant. Distinct from the per-screen "?"
// HelpModal (src/components/HelpModal.tsx) - that's quick contextual tips
// per screen; this is a deeper reference someone can land on from outside
// the app (a search result, a support reply) with no navigation context.
//
// Per explicit product decision, native doesn't get its own FAQ UI - a
// ".web"-only route was tried first, but expo-router (SDK 57) requires a
// platform-agnostic fallback file to exist for route generation at all
// ("does not have a fallback sibling file without a platform extension"),
// so this file is the one shared route, same as legal.tsx. The product
// intent is honored in navigation, not file layout: nothing in the native
// app ever router.push()es here - HelpModal's "Visit full FAQ" opens this
// same URL in the device's real browser on native, and only uses in-app
// navigation on web (see openFaq() in HelpModal.tsx).
type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const SECTIONS: FaqSection[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'Why does Steer Me ask for a Global Handicap card?',
        a: "If you have one, it's how we confirm your classification number and position, which makes every match eligible. Your card is only ever shown to someone you've actually matched with, never the whole platform. No card? See the next question: you're welcome here too.",
      },
      {
        q: "I don't have a Global card. Can I still use Steer Me?",
        a: "Yes. Choose No when we ask if you have a card, answer a few quick questions about your roping, and confirm your phone number with a one-time text. Your number will show as Self-reported, so partners know it's your own claim until a producer confirms it. You can raise it any time, but you can only lower it 90 days after your last change.",
      },
      {
        q: "My text code never came. What do I do?",
        a: "Check that the number is your mobile and that the country shown above it (US / Canada or Mexico) matches. Wait a minute, then tap Send a new code - only the newest code works, and each expires after about ten minutes. Some phones block unknown senders or short messages. Never send anyone your code, including us. Still stuck? Email ropingtools@duratex-ie.com and tell us where it stopped.",
      },
      {
        q: "I signed up but never got the confirmation email.",
        a: "Check your spam or junk folder for a message from noreply@ropingtoolsmail.com, tap Not spam, then tap the link. Or open Steer Me, tap Sign in, and if it says your email isn't confirmed, tap Send it again.",
      },
      {
        q: "What's a Switch Ender?",
        a: "Someone who can rope either Header or Heeler. Switch Enders show up as a potential match for both positions.",
      },
      {
        q: "I'm under 18 - is there anything extra I need to do?",
        a: 'A parent or guardian needs to complete a consent step before your account is fully verified.',
      },
    ],
  },
  {
    title: 'Finding a partner',
    items: [
      {
        q: 'How does Browse decide who I can partner with?',
        a: "By your position and classification number - only ropers you're actually eligible to team with show up. Use the location toggle to narrow it to people near you.",
      },
      {
        q: 'I qualified for the WSTR Finale but lost my partner. Can Steer Me help?',
        a: "Yes. Open the Finale board (WSTR Finale Partners), say you qualified and need a partner, and pick your class to see others in the same boat. The Finale uses a current Global card; if you don't have one, the app shows where to get it. Steer Me is independent and isn't affiliated with WSTR.",
      },
      {
        q: 'Where are the clinics and schools?',
        a: "Open Events and tap Clinics & schools in the Type row. They are kept out of the main list of ropings, so you only see them when you choose that chip. Each one shows the instructor, dates, cost and how to sign up.",
      },
      {
        q: 'What happens when I favorite someone?',
        a: "It's private - they're never notified. Favoriting just gives you quick access to them later, and lets you choose \"My Favorites\" or \"Select Favorites\" as the audience when you post a need.",
      },
      {
        q: "I posted a need. Who can see it?",
        a: 'Whoever you chose when posting: Everyone eligible, only your favorites, or a hand-picked few.',
      },
    ],
  },
  {
    title: 'Events & entering',
    items: [
      {
        q: "Some events show \"Enter the Draw\" and others show a phone number instead. Why?",
        a: "It depends on whether the producer runs that event on Draw Pro, the software producers use to manage entries and results. If they do, you enter right in the app and everything (team number, results) syncs automatically. If they don't, entry happens the old way - by phone, text, or in person - and the event card tells you which method to use.",
      },
      {
        q: "Will every producer eventually be on Draw Pro?",
        a: "More are joining over time, but it's each producer's own choice. There's no way to predict it from inside the app beyond checking what a specific event's listing shows.",
      },
    ],
  },
  {
    title: 'My Entries & results',
    items: [
      {
        q: "I entered an event but nothing shows up in My Entries.",
        a: "My Entries only shows entries made through \"Enter the Draw\" on a Draw Pro event. If you entered by phone, text, or in person instead, there's nothing to sync - check with the producer directly for your team number and results.",
      },
      {
        q: "When does my team number appear?",
        a: "The moment the producer runs the draw for that class - not before. If entries are still open, there's nothing to show yet.",
      },
      {
        q: "When do round results show up?",
        a: "As soon as the producer saves them, round by round - time, penalties, or a No Time. No need to track anyone down at the event.",
      },
      {
        q: 'I got a notification about my standing mid-event. What was that?',
        a: "Once a round is fully finished, the top 20 teams get a push showing their current place - e.g. \"You're sitting 6th of 212.\" It's a live snapshot, not a final result - it only fires again after the next round completes.",
      },
      {
        q: "My Entries shows results from a while ago and looks stuck.",
        a: "If your connection drops (common at an arena), Steer Me keeps showing your last-known results rather than a blank screen, with a note on when they're from. Pull to refresh, or check your connection, to get current data.",
      },
    ],
  },
  {
    title: 'Account & subscription',
    items: [
      {
        q: 'What is free and what needs a subscription?',
        a: "Downloading, browsing and your first 3 accepted matches are free. After that, a subscription keeps you matching. See the Subscription screen for the current plans. You can subscribe in the app (billed by the App Store or Google Play) or on steerme.ropingtools.com. The paperwork check and layover finder are free with your Steer Me account.",
      },
      {
        q: 'How do I turn on notifications for team numbers and results?',
        a: "Account Settings, if you've entered at least one event through Steer Me.",
      },
      {
        q: 'What happens if I cancel my subscription?',
        a: 'Your access continues through the end of your current billing period, then ends - cancel any time before that with no penalty. If you subscribed on the web, use Manage subscription on the Subscription screen. If you subscribed in the app, cancel in your App Store or Google Play subscription settings.',
      },
      {
        q: "I need to block or report someone.",
        a: "Block from their profile at any time - they can't contact you or appear in your matches after that, and you can unblock later if you change your mind. Report an event or a person directly from the relevant screen if something's wrong.",
      },
    ],
  },
  {
    title: 'Hauling & travel',
    items: [
      {
        q: 'Where are the paperwork check and the layover finder?',
        a: "Profile, then Horse papers & travel check (My Horses). Both are free with your Steer Me account. The paperwork check shows the health papers, Coggins and outbreak rules that may apply for the states you haul from, through and to, with where each came from and when it was checked. The layover finder lists places to stop overnight along your route, with stalls or pens, RV hookups if you want them, and an address and contact for each.",
      },
      {
        q: 'Can I count on the layover stops being open and available?',
        a: "No. The stops come from public listings and can be out of date, and stalls fill up for events. Call ahead, and confirm paperwork rules with the state, the event and your vet. Know a stop we're missing, or see one that's wrong? Email ropingtools@duratex-ie.com.",
      },
    ],
  },
  {
    title: 'Producers',
    items: [
      {
        q: 'I teach clinics or schools. Can I list them?',
        a: "Yes. When you create your account choose I teach clinics or schools, or open List your business from Home and pick An instructor. After a quick verification (a flier from a past clinic or a screenshot of your website or social page works), you can post your clinics and schools. They show only under Clinics & schools, and it is free.",
      },
      {
        q: 'I own a layover spot, horse motel or hotel. Can I list it?',
        a: "Yes. When you create your account choose I own a layover spot or hotel, or open List your business from Home and pick A layover spot or hotel. After a quick verification (a photo of your sign or a screenshot of your website or business listing works), add your listing with your address, phone, stalls or pens and RV hookups. Our team approves each listing before it appears in the Layover Finder. Listing is free.",
      },
      {
        q: 'Can I pay to have my clinic, layover spot or hotel featured?',
        a: "Yes, on the Steer Me website. A featured clinic appears first under Clinics & schools, and a featured layover spot or hotel appears in its own Featured block at the top of the Layover Finder results for its route, both with a Featured label. You pay once through Stripe for a set number of days (the price and length are shown before you pay), and it does not renew on its own. Open your dashboard on steerme.ropingtools.com and tap Feature this listing. Featuring does not change what a listing says, and all listings still go through the same review.",
      },
      {
        q: "I list events on Steer Me. Is that the same thing as Draw Pro?",
        a: "No - listing and promoting your event is done from your business dashboard right here in Steer Me. Draw Pro is a separate tool for running the event itself (draw, run order, live results, payouts). You can use either on its own, or both together for the full synced experience contestants see in My Entries.",
      },
    ],
  },
  {
    title: 'Still stuck?',
    items: [
      {
        q: "My question isn't answered here.",
        a: 'Use Report an Issue from your Profile screen. If you can\'t get into the app, email ropingtools@duratex-ie.com and tell us where it stopped. Either way, let us know which event or screen you\'re asking about.',
      },
    ],
  },
];

export default function Faq() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="FAQ" subtitle="Quick answers for contestants" onBack={() => goBackOrHome()} />
      <ScrollView contentContainerStyle={styles.content}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              const key = `${section.title}:${item.q}`;
              const open = openKeys.has(key);
              return (
                <Pressable key={key} style={styles.item} onPress={() => toggle(key)}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.question}>{item.q}</Text>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.brass}
                    />
                  </View>
                  {open ? <Text style={styles.answer}>{item.a}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        <Text style={styles.footerNote}>
          Producer running events on Draw Pro? See the Draw Pro FAQ from your Draw Pro dashboard.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, paddingTop: spacing.md, gap: spacing.xl, ...webMaxWidth },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.espresso,
    marginBottom: 2,
  },
  item: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: 'rgba(169,129,46,0.35)',
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  question: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.espresso,
    lineHeight: 19,
  },
  answer: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
    marginTop: 8,
  },
  footerNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.saddle,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
