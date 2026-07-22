import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Purchases, { type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { HelpModal } from '@/src/components/HelpModal';
import { DividerNote } from '@/src/components/ui/DividerNote';
import { Pill } from '@/src/components/ui/Pill';
import { Button } from '@/src/components/ui/Button';
import { colors, fonts, radii } from '@/src/theme/theme';
import { webMaxWidth } from '@/src/theme/web-layout';
import { fetchOfferings } from '@/src/lib/purchases';
import { useSubscriptionStatus, useInvalidateSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';
import { showToast } from '@/src/state/toast-store';

type Plan = 'annual' | 'monthly';

const PLAN_COPY: Record<Plan, { title: string; price: string; sub: string }> = {
  annual: { title: 'Annual membership', price: '$39.99/yr', sub: '$39.99/year — works out to about $3.33/month' },
  monthly: { title: 'Monthly membership', price: '$6.99/mo', sub: '$6.99/month — billed every 30 days' },
};

// Mirrors Screen 14 (#subscription). Unlike the prototype's "Demo only - no
// payment is collected" button, this calls the real RevenueCat purchase
// flow - but since no RevenueCat project/product is configured yet (an
// external account-creation step outside this codebase), offerings will be
// empty until that's set up, and this screen says so rather than pretending
// to sell something that doesn't exist yet.
export default function Subscription() {
  const [plan, setPlan] = useState<Plan>('annual');
  const [helpOpen, setHelpOpen] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const { data: status } = useSubscriptionStatus();
  const invalidateStatus = useInvalidateSubscriptionStatus();

  useEffect(() => {
    fetchOfferings().then(setOffering);
  }, []);

  const selectedPackage: PurchasesPackage | undefined = offering?.availablePackages.find((p) =>
    plan === 'annual' ? p.packageType === 'ANNUAL' : p.packageType === 'MONTHLY'
  );

  async function handleSubscribe() {
    if (!selectedPackage) {
      showToast('Subscriptions are not available yet - check back soon');
      return;
    }
    setPurchasing(true);
    try {
      await Purchases.purchasePackage(selectedPackage);
      showToast('Subscribed - syncing with your account...');
      invalidateStatus();
    } catch (err) {
      const cancelled = typeof err === 'object' && err !== null && 'userCancelled' in err && (err as { userCancelled?: boolean }).userCancelled;
      if (!cancelled) showToast(err instanceof Error ? err.message : 'Could not complete purchase');
    } finally {
      setPurchasing(false);
    }
  }

  // Subscriptions are billed through StoreKit/Play Billing via RevenueCat -
  // there is no web equivalent wired up, and building one (e.g. Stripe
  // Checkout) is separate, later work, not something to fake here. The web
  // build still needs to work for someone who's already subscribed via the
  // mobile app, though - status still reads from the same Supabase-synced
  // `subscriptions` table regardless of platform, so that part is accurate.
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Subscription" subtitle="One membership, unlimited draw-in fees skipped" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
        <ScrollView contentContainerStyle={styles.content}>
          {status?.entitlement_active ? (
            <DividerNote>
              <Text style={{ fontFamily: fonts.bodyBold }}>You're subscribed. </Text>
              {status.expires_at ? `Renews/expires ${new Date(status.expires_at).toLocaleDateString()}.` : ''}
            </DividerNote>
          ) : (
            <DividerNote>
              Subscriptions are managed through the Steer Me mobile app (App Store / Google Play), not
              here on the web. If you're already subscribed on your phone, it'll show as active here too -
              your subscription follows your account, not the device.
            </DividerNote>
          )}
        </ScrollView>
        <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="subscription" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Subscription" subtitle="One membership, unlimited draw-in fees skipped" onBack={() => router.back()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {status?.entitlement_active ? (
          <DividerNote>
            <Text style={{ fontFamily: fonts.bodyBold }}>You're subscribed. </Text>
            {status.expires_at ? `Renews/expires ${new Date(status.expires_at).toLocaleDateString()}.` : ''}
          </DividerNote>
        ) : null}

        <View style={styles.capBanner}>
          <Text style={styles.capNum}>$40</Text>
          <Text style={styles.capLbl}>Typical draw-in fee, per run, per producer</Text>
        </View>
        <DividerNote>
          Most ropers pay a draw-in fee every time they need a producer to find them a partner. Steer Me
          lets you find and lock in your own partner ahead of time - for less than the cost of one
          draw-in fee, for the whole year.
        </DividerNote>

        <View style={styles.pillRow}>
          <Pill label="Annual — $39.99/yr" selected={plan === 'annual'} onPress={() => setPlan('annual')} />
          <Pill label="Monthly — $6.99/mo" selected={plan === 'monthly'} onPress={() => setPlan('monthly')} />
        </View>

        <View style={styles.planCard}>
          <Text style={styles.planTitle}>{PLAN_COPY[plan].title}</Text>
          <Text style={styles.planSub}>{PLAN_COPY[plan].sub}</Text>
          <Text style={styles.planDesc}>
            Unlimited partner search, posting, requests, and event browsing. Cancel any time - billed
            through the App Store or Google Play.
          </Text>
        </View>

        <Button
          label={status?.entitlement_active ? 'Change plan' : 'Subscribe'}
          onPress={handleSubscribe}
          loading={purchasing}
          disabled={!selectedPackage}
        />
        {!offering ? (
          <Text style={styles.unavailableNote}>
            Subscriptions aren't available yet in this build - the RevenueCat project and App
            Store/Google Play products haven't been set up.
          </Text>
        ) : null}
      </ScrollView>
          <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="subscription" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bone },
  content: { padding: 20, ...webMaxWidth },
  capBanner: {
    backgroundColor: colors.tan,
    borderWidth: 1,
    borderColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  capNum: { fontFamily: fonts.mono, fontSize: 26, color: colors.brass },
  capLbl: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.espresso,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 4 },
  planCard: {
    backgroundColor: colors.tanLight,
    borderWidth: 1,
    borderColor: colors.saddle,
    borderLeftWidth: 4,
    borderLeftColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  planTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.espresso },
  planSub: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.brass, marginTop: 2 },
  planDesc: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, marginTop: 8, lineHeight: 17 },
  unavailableNote: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11.5,
    color: colors.saddle,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});
