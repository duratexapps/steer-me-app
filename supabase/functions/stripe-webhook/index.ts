// Stripe -> Supabase sync for WEB subscriptions. The only writer of `stripe_subscriptions`. It never touches
// `subscriptions` (the RevenueCat / Apple / Google cache), so a store event can never switch off a web
// subscriber and a web event can never switch off a store subscriber (migration 0098).
//
// Security: every request must carry a valid Stripe-Signature for the RAW body (HMAC with STRIPE_WEBHOOK_SECRET,
// five-minute tolerance). Without the secret configured, everything is rejected (fail closed).
//
// Add this function's URL in Stripe (Developers > Webhooks) with these events:
//   checkout.session.completed, customer.subscription.created, customer.subscription.updated,
//   customer.subscription.deleted, invoice.payment_failed, charge.refunded
// Secrets (set by Justin with `supabase secrets set`, never in chat): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { stripeRequest, verifyStripeSignature } from '../_shared/stripe.ts';

// past_due stays active while Stripe retries the card, the same grace the store flow gives a billing issue.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

type Admin = ReturnType<typeof createSupabaseAdmin>;

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret || !secretKey) return new Response('Not configured', { status: 503 });

  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret))) {
    return new Response('Bad signature', { status: 400 });
  }

  let event: { id: string; type: string; created: number; data: { object: any } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const obj = event.data?.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // A paid featured-listing purchase (migration 0109) is a one-time payment, not a subscription.
        if (obj.metadata?.kind === 'featured') {
          await activateFeatured(admin, obj);
          break;
        }
        // Links the Stripe customer / subscription to the Steer Me user. The subscription events below carry the
        // real status; this just makes sure the link exists even if they arrive first.
        const userId = obj.client_reference_id as string | null;
        if (userId && obj.customer) {
          await admin.from('stripe_subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: obj.customer,
            ...(obj.subscription ? { stripe_subscription_id: obj.subscription } : {}),
          });
        }
        if (obj.subscription) {
          // Pull the subscription itself so status is right immediately, not only when its own event lands.
          const sub = await stripeRequest(secretKey, 'GET', `/subscriptions/${obj.subscription}`);
          if (sub.ok) await syncSubscription(admin, sub.data, event.created, userId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(admin, obj, event.created, null);
        break;
      case 'invoice.payment_failed':
      case 'charge.refunded':
        // Status changes arrive as subscription events. Logged so a refund or failed payment is visible in the
        // function logs without anyone digging through Stripe.
        console.log(event.type, obj?.customer, obj?.id);
        break;
      default:
        return Response.json({ skipped: event.type });
    }
  } catch (err) {
    console.error('Stripe webhook handler failed', event.type, event.id, err);
    // 500 makes Stripe retry, which is what we want for a transient database error.
    return new Response('Handler error', { status: 500 });
  }

  return Response.json({ ok: true, type: event.type });
});

// Writes one subscription's state. The user is found by the Stripe customer id we saved at checkout time, then
// the supabase_user_id we stamped into the subscription metadata, then (checkout event only) client_reference_id.
async function syncSubscription(admin: Admin, sub: any, eventCreated: number, fallbackUserId: string | null) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  let userId: string | null = null;

  if (customerId) {
    const { data } = await admin.from('stripe_subscriptions').select('user_id, last_event_at').eq('stripe_customer_id', customerId).maybeSingle();
    userId = data?.user_id ?? null;
    // Ignore an event older than one we've already applied (Stripe does not guarantee delivery order).
    if (data?.last_event_at && new Date(data.last_event_at).getTime() / 1000 > eventCreated) return;
  }
  userId = userId ?? sub.metadata?.supabase_user_id ?? fallbackUserId;
  if (!userId) {
    console.error('Stripe subscription with no matching Steer Me user', sub.id, customerId);
    return;
  }

  // Newer Stripe API versions put the period end on the item, older ones on the subscription.
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  const lookupKey = sub.items?.data?.[0]?.price?.lookup_key ?? null;
  const toIso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

  const { error } = await admin.from('stripe_subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: sub.id,
    status: sub.status,
    active: ACTIVE_STATUSES.has(sub.status),
    price_lookup_key: lookupKey,
    current_period_end: toIso(periodEnd),
    trial_end: toIso(sub.trial_end),
    // Older API versions set cancel_at_period_end; newer ones leave it false and set cancel_at to the date the
    // subscription will end (found in the first sandbox test). Either means "will not renew".
    cancel_at_period_end: !!sub.cancel_at_period_end || sub.cancel_at != null,
    last_event_at: new Date(eventCreated * 1000).toISOString(),
  });
  if (error) throw error;
}

// A featured-listing payment completed: mark the purchase paid and extend the listing's featured_until by the days
// that were bought (stacking on any time still remaining). Safe to run twice for the same session (Stripe retries):
// a purchase that is already paid is left alone.
async function activateFeatured(admin: Admin, session: any) {
  const purchaseId = session.metadata?.purchase_id as string | undefined;
  // 'no_payment_required' is a 100%-off promotion code: nothing was charged, but the purchase is still honored.
  if (!purchaseId || (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required')) return;

  const { data: purchase } = await admin.from('featured_purchases').select('*').eq('id', purchaseId).maybeSingle();
  if (!purchase) {
    console.error('Featured purchase not found', purchaseId);
    return;
  }
  if (purchase.status === 'paid') return;

  const table = purchase.target_type === 'event' ? 'events' : 'layover_spots';
  const { data: target } = await admin.from(table).select('featured_until').eq('id', purchase.target_id).maybeSingle();
  const now = Date.now();
  const current = target?.featured_until ? new Date(target.featured_until).getTime() : 0;
  const until = new Date(Math.max(now, current) + purchase.days * 24 * 60 * 60 * 1000).toISOString();

  const { error: updError } = await admin.from(table).update({ featured_until: until }).eq('id', purchase.target_id);
  if (updError) throw updError;
  const { error: payError } = await admin
    .from('featured_purchases')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id })
    .eq('id', purchaseId);
  if (payError) throw payError;
}
