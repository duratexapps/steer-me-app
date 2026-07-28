// RevenueCat -> Supabase sync. Configure this function's URL in the
// RevenueCat dashboard (Project Settings -> Integrations -> Webhooks) along
// with an Authorization header value matching REVENUECAT_WEBHOOK_AUTH below
// (see supabase/RUNBOOK.md). This is the ONLY writer of the `subscriptions`
// table - the client SDK is used for optimistic UI only, every RLS policy
// that gates a paid action checks this table via has_active_subscription(),
// not the client SDK's local entitlement cache.
//
// UPDATED 2026-07-27: also grants the refer-a-friend reward here, on the
// referred person's FIRST subscription activation (INITIAL_PURCHASE
// specifically, not renewals - a referral reward is a one-time signup
// incentive, not something that re-fires every year). Reward is real
// free time granted directly through RevenueCat's own Promotional
// Entitlements API to both people, rather than a separate in-house
// credit ledger that could drift from what RevenueCat itself considers
// true - this webhook is already the single place subscription state
// gets written, so it's the natural place to extend.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

// [ ] - confirm this matches the actual entitlement identifier once the
// real RevenueCat project exists (see RUNBOOK.md's setup section) -
// there's no live project yet, so this is a reasonable placeholder name,
// not a confirmed value.
const RC_ENTITLEMENT_ID = 'premium';
const REFERRAL_REWARD_DURATION = 'monthly'; // one free month, for both people, per successful referral
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

// Event types that grant/extend an active entitlement.
const ENTITLEMENT_GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
  'TRANSFER',
  'PURCHASE_REDEEMED',
]);

// Only EXPIRATION actually ends access. CANCELLATION means auto-renew was
// turned off but the current period is still paid for; BILLING_ISSUE is a
// failed charge attempt that RevenueCat itself retries during a grace
// period. Revoking on either of those would cut a paying user off early, so
// this intentionally waits for the EXPIRATION event that follows once the
// paid period actually ends.
const ENTITLEMENT_REVOKING_EVENTS = new Set(['EXPIRATION']);

type RevenueCatEvent = {
  type: string;
  app_user_id: string;
  product_id?: string;
  expiration_at_ms?: number | null;
};

Deno.serve(async (req) => {
  const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (expectedAuth && req.headers.get('authorization') !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { event: RevenueCatEvent };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const event = body.event;
  if (!event?.app_user_id || !event.type) {
    return new Response('Missing event.app_user_id or event.type', { status: 400 });
  }

  if (!ENTITLEMENT_GRANTING_EVENTS.has(event.type) && !ENTITLEMENT_REVOKING_EVENTS.has(event.type)) {
    // TEST, PAYWALL_*, and other informational events - nothing to sync.
    return Response.json({ skipped: event.type });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    id: event.app_user_id,
    entitlement_active: ENTITLEMENT_GRANTING_EVENTS.has(event.type),
    product_id: event.product_id ?? null,
    expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to sync subscription', event.app_user_id, error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Checked on every entitlement-granting event, not just INITIAL_PURCHASE
  // specifically - grantReferralRewardIfEligible() itself gates on
  // referral_reward_granted_at still being null, so this is naturally
  // idempotent and doubles as the retry path if an earlier attempt failed
  // (e.g. a transient RevenueCat API error on the original purchase gets
  // a real second chance on the next renewal, rather than being
  // permanently skipped).
  let referralReward: { granted: boolean; reason?: string } = { granted: false };
  if (ENTITLEMENT_GRANTING_EVENTS.has(event.type)) {
    referralReward = await grantReferralRewardIfEligible(supabaseAdmin, event.app_user_id);
  }

  return Response.json({
    synced: event.app_user_id,
    active: ENTITLEMENT_GRANTING_EVENTS.has(event.type),
    referralReward,
  });
});

/**
 * Grants one free month to both the referrer and the newly-subscribed
 * referred person, exactly once per referral. No-ops (not an error) if
 * this person wasn't referred, or if the reward was already granted -
 * both are expected, common outcomes, not failures.
 */
async function grantReferralRewardIfEligible(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  referredUserId: string
): Promise<{ granted: boolean; reason?: string }> {
  const { data: referredProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, referred_by, referral_reward_granted_at')
    .eq('id', referredUserId)
    .single();

  if (profileError || !referredProfile) {
    console.error('Could not load profile for referral reward check', referredUserId, profileError);
    return { granted: false, reason: 'profile not found' };
  }
  if (!referredProfile.referred_by) {
    return { granted: false, reason: 'not a referred signup' };
  }
  if (referredProfile.referral_reward_granted_at) {
    return { granted: false, reason: 'already granted' };
  }

  const apiKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!apiKey) {
    // Same "don't fail the whole webhook over an unconfigured extra" as
    // verify-classification-card's ANTHROPIC_API_KEY fallback - the real
    // subscription sync above already succeeded and returned; this just
    // means the reward step specifically couldn't run yet.
    console.error('REVENUECAT_SECRET_API_KEY not set - skipping referral reward grant');
    return { granted: false, reason: 'not configured' };
  }

  const grantOne = (appUserId: string) =>
    fetch(`${REVENUECAT_API_BASE}/subscribers/${appUserId}/entitlements/${RC_ENTITLEMENT_ID}/promotional`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: REFERRAL_REWARD_DURATION }),
    });

  const [referrerResponse, referredResponse] = await Promise.all([
    grantOne(referredProfile.referred_by),
    grantOne(referredUserId),
  ]);

  if (!referrerResponse.ok || !referredResponse.ok) {
    console.error(
      'Referral reward grant failed',
      referredUserId,
      referrerResponse.status,
      await referrerResponse.text().catch(() => ''),
      referredResponse.status,
      await referredResponse.text().catch(() => '')
    );
    // Deliberately does NOT set referral_reward_granted_at - leaving it
    // null means this will be retried on a future webhook event for this
    // user (e.g. a renewal) rather than being permanently skipped over a
    // transient RevenueCat API failure.
    return { granted: false, reason: 'RevenueCat API call failed' };
  }

  await supabaseAdmin
    .from('profiles')
    .update({ referral_reward_granted_at: new Date().toISOString() })
    .eq('id', referredUserId);

  return { granted: true };
}
