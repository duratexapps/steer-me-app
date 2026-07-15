// RevenueCat -> Supabase sync. Configure this function's URL in the
// RevenueCat dashboard (Project Settings -> Integrations -> Webhooks) along
// with an Authorization header value matching REVENUECAT_WEBHOOK_AUTH below
// (see supabase/RUNBOOK.md). This is the ONLY writer of the `subscriptions`
// table - the client SDK is used for optimistic UI only, every RLS policy
// that gates a paid action checks this table via has_active_subscription(),
// not the client SDK's local entitlement cache.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

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

  return Response.json({ synced: event.app_user_id, active: ENTITLEMENT_GRANTING_EVENTS.has(event.type) });
});
