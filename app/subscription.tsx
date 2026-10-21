import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
import { startWebCheckout, openBillingPortal } from '@/src/lib/web-checkout';
import { useSubscriptionStatus, useInvalidateSubscriptionStatus, useFreeTierStatus } from '@/src/hooks/useSubscriptionStatus';
import { showToast } from '@/src/state/toast-store';
import { goBackOrHome } from '@/src/lib/navigation';

type Plan = 'annual' | 'monthly';

// Apple rejected 1.3.4 under 2.3.10 for this screen naming Google Play in
// the iOS binary - a reviewer should only ever see the store they're
// reviewing on, never the other platform's name.
const storeName = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

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
  const { data: status } = useSubscriptionStatus(true); // poll briefly - this is the purchase screen
  const invalidateStatus = useInvalidateSubscriptionStatus();
  const { data: freeTier } = useFreeTierStatus();
  const [webBusy, setWebBusy] = useState(false);
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  // Coming back from Stripe Checkout: success means the webhook is about to flip the status, so refresh (the
  // screen already polls), and a cancel just says so.
  useEffect(() => {
    if (checkout === 'success') {
      showToast('Thanks! Setting up your subscription...');
      invalidateStatus();
    } else if (checkout === 'cancelled') {
      showToast('Checkout cancelled - nothing was charged');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout]);

  async function handleWebSubscribe() {
    setWebBusy(true);
    try {
      const url = await startWebCheckout(plan === 'annual' ? 'yearly' : 'monthly');
      window.location.assign(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "We couldn't start checkout. Please try again.");
      setWebBusy(false);
    }
  }

  async function handleManage() {
    setWebBusy(true);
    try {
      const url = await openBillingPortal();
      window.location.assign(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "We couldn't open your subscription settings. Please try again.");
      setWebBusy(false);
    }
  }

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

  // Web (steerme.ropingtools.com): subscribe through Stripe (migration 0098). This offer, including the free
  // month, is shown ONLY here on the web. The iOS and Android apps keep the store purchase flow below and do not
  // mention or link to it, because the stores restrict steering app users to an outside payment (revisit once the
  // Apple / Google link-out rules settle).
  if (Platform.OS === 'web') {
    const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');
    const trialing = status?.web_status === 'trialing' && status?.web_trial_end;
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScreenHeader title="Subscription" subtitle="One membership, unlimited draw-in fees skipped" onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
        <ScrollView contentContainerStyle={styles.content}>
          {status?.entitlement_active ? (
            <>
              <DividerNote>
                <Text style={{ fontFamily: fonts.bodyBold }}>You're subscribed. </Text>
                {status?.web_cancel_at_period_end
                  ? `Your access continues through ${fmt(status?.expires_at)}. It will not renew.`
                  : trialing
                    ? `Your free month ends ${fmt(status?.web_trial_end)}, then your plan renews automatically.`
                    : status?.expires_at
                      ? `Renews/expires ${fmt(status.expires_at)}.`
                      : ''}
              </DividerNote>
              {status?.source === 'store' ? (
                <DividerNote>You subscribed through the App Store or Google Play, so manage or cancel it there.</DividerNote>
              ) : null}
              {status?.source === 'both' ? (
                <DividerNote>
                  You have a web subscription and an App Store or Google Play one. Cancel the one you don't want, so you only pay once.
                </DividerNote>
              ) : null}
              {status?.web_has_customer && status?.web_active ? (
                <Button label="Manage subscription" onPress={handleManage} loading={webBusy} />
              ) : null}
            </>
          ) : status?.web_checkout_enabled ? (
            <>
              {status?.web_trial_eligible ? (
                <View style={styles.offerBanner}>
                  <Text style={styles.offerTitle}>Your first month is free</Text>
                  <Text style={styles.offerSub}>Subscribe here on the web and the first month is on us.</Text>
                </View>
              ) : null}
              <View style={styles.pillRow}>
                <Pill label="Annual — $39.99/yr" selected={plan === 'annual'} onPress={() => setPlan('annual')} />
                <Pill label="Monthly — $6.99/mo" selected={plan === 'monthly'} onPress={() => setPlan('monthly')} />
              </View>
              <View style={styles.planCard}>
                <Text style={styles.planTitle}>{PLAN_COPY[plan].title}</Text>
                <Text style={styles.planSub}>{PLAN_COPY[plan].sub}</Text>
                <Text style={styles.planDesc}>
                  Unlimited partner search, posting, requests, and event browsing.{' '}
                  {status?.web_trial_eligible
                    ? 'After your free month your plan renews automatically until you cancel. '
                    : 'Your plan renews automatically until you cancel. '}
                  Cancel any time from Manage subscription.
                </Text>
              </View>
              <Button
                label={status?.web_trial_eligible ? 'Start my free month' : 'Subscribe'}
                onPress={handleWebSubscribe}
                loading={webBusy}
              />
              <Text style={styles.unavailableNote}>Secure checkout by Stripe. Your subscription follows your account, on any device.</Text>
            </>
          ) : (
            <DividerNote>
              Steer Me is free to use during testing - no subscription needed right now. Once testing
              wraps up, subscribing will be available right here on the web, as well as in the mobile app -
              your subscription will follow your account either way, not the device.
            </DividerNote>
          )}
          <Button label="Have a code?" variant="ghost" onPress={() => router.push('/redeem-code')} style={{ marginTop: 8 }} />
        </ScrollView>
        <HelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} topic="subscription" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScreenHeader title="Subscription" subtitle="One membership, unlimited draw-in fees skipped" onBack={() => goBackOrHome()} onHelp={() => setHelpOpen(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {status?.entitlement_active ? (
          <DividerNote>
            <Text style={{ fontFamily: fonts.bodyBold }}>You're subscribed. </Text>
            {status.expires_at ? `Renews/expires ${new Date(status.expires_at).toLocaleDateString()}.` : ''}
          </DividerNote>
        ) : null}

        {freeTier?.paywall_enabled && !status?.entitlement_active ? (
          <DividerNote>
            <Text style={{ fontFamily: fonts.bodyBold }}>
              {freeTier.matches_used} of {freeTier.free_matches} free matches used.{' '}
            </Text>
            {freeTier.allowed
              ? 'Subscribe any time to keep going after your free matches.'
              : 'Subscribe to keep finding partners.'}
          </DividerNote>
        ) : null}

        <Button label="Have a code?" variant="ghost" onPress={() => router.push('/redeem-code')} style={{ alignSelf: 'flex-start' }} />

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
            through {storeName}.
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
            Subscriptions aren't available yet in this build - the RevenueCat project hasn't been
            fully configured for this platform yet.
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
  offerBanner: {
    backgroundColor: colors.brass,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  offerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.bone },
  offerSub: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.bone, marginTop: 2, textAlign: 'center' },
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
