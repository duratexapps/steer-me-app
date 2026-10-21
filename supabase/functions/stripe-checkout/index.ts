// Starts a Stripe Checkout for a web subscription (Route A: web only; Apple / Google purchases are separate and
// untouched). The caller must be a signed-in Steer Me user. Returns { url } and the browser goes there.
//
// Safety rails:
//  * Does nothing until app_settings.web_checkout_enabled is true (flipped on only when LIVE Stripe keys are in
//    place), so a sandbox / test-card checkout can never grant real access.
//  * Refuses people who are already subscribed through any source, so nobody pays twice by accident.
//  * The first-month-free trial is only offered to someone who has never had a Stripe subscription.
//  * The price is found by lookup key (steerme_monthly / steerme_yearly), so moving from sandbox to live needs no
//    code change, only live products with the same keys.
//
// Secrets (set by Justin with `supabase secrets set`, never in chat): STRIPE_SECRET_KEY.
// Optional: STRIPE_AUTOMATIC_TAX=true once Stripe Tax is configured; APP_URL; STRIPE_TRIAL_DAYS (default 30).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { serveWithCors } from '../_shared/cors.ts';
import { APP_URL, stripeRequest } from '../_shared/stripe.ts';

const LOOKUP_KEYS: Record<string, string> = { monthly: 'steerme_monthly', yearly: 'steerme_yearly' };

serveWithCors(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
  const callerClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const user = callerData.user;

  if (!(await checkRateLimit(`user:${user.id}`, 'stripe_checkout', 20, 60))) {
    return Response.json({ error: 'Too many attempts - try again in a little while.' }, { status: 429 });
  }

  let body: { plan?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const lookupKey = LOOKUP_KEYS[body.plan ?? ''];
  if (!lookupKey) return Response.json({ error: 'Choose monthly or yearly.' }, { status: 400 });

  const admin = createSupabaseAdmin();

  const { data: flag } = await admin.from('app_settings').select('value').eq('key', 'web_checkout_enabled').maybeSingle();
  if (flag?.value !== true) {
    return Response.json({ error: 'Subscribing on the web is not open yet.' }, { status: 409 });
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return Response.json({ error: 'Subscribing is not available yet. Please try again later.' }, { status: 503 });

  // Already subscribed through either source? Don't sell a second one.
  const [{ data: store }, { data: web }] = await Promise.all([
    admin.from('subscriptions').select('entitlement_active').eq('id', user.id).maybeSingle(),
    admin.from('stripe_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  if (store?.entitlement_active || web?.active) {
    return Response.json({ error: "You're already subscribed." }, { status: 409 });
  }

  const price = await stripeRequest(secretKey, 'GET', '/prices', { 'lookup_keys[]': lookupKey, active: 'true', limit: 1 });
  const priceId = price.data?.data?.[0]?.id;
  if (!price.ok || !priceId) {
    console.error('Price lookup failed', lookupKey, price.status, JSON.stringify(price.data).slice(0, 300));
    return Response.json({ error: 'That plan is not available right now.' }, { status: 502 });
  }

  // One Stripe customer per person, reused on every attempt.
  let customerId: string | null = web?.stripe_customer_id ?? null;
  if (!customerId) {
    const created = await stripeRequest(secretKey, 'POST', '/customers', {
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    if (!created.ok) {
      console.error('Customer create failed', created.status, JSON.stringify(created.data).slice(0, 300));
      return Response.json({ error: "We couldn't start checkout. Please try again." }, { status: 502 });
    }
    customerId = created.data.id as string;
    await admin.from('stripe_subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId });
  }

  // First month free: only for someone who has never had a Stripe subscription.
  const trialEligible = !web?.stripe_subscription_id;
  const trialDays = Number(Deno.env.get('STRIPE_TRIAL_DAYS') ?? '30');
  const automaticTax = Deno.env.get('STRIPE_AUTOMATIC_TAX') === 'true';

  const session = await stripeRequest(secretKey, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: 'always',
    // Card only (Apple Pay / Google Pay still ride on it). Cash App, Klarna and bank debits suit one-off
    // purchases, not a subscription that renews, and fail or dispute more often.
    payment_method_types: ['card'],
    allow_promotion_codes: 'true',
    subscription_data: {
      metadata: { supabase_user_id: user.id },
      ...(trialEligible && trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
    ...(automaticTax ? { automatic_tax: { enabled: 'true' }, customer_update: { address: 'auto' } } : {}),
    custom_text: {
      submit: {
        message: trialEligible && trialDays > 0
          ? 'Your first month is free. After that your plan renews automatically until you cancel. Cancel any time from Manage subscription in Steer Me.'
          : 'Your plan renews automatically until you cancel. Cancel any time from Manage subscription in Steer Me.',
      },
    },
    success_url: `${APP_URL}/subscription?checkout=success`,
    cancel_url: `${APP_URL}/subscription?checkout=cancelled`,
  });

  if (!session.ok || !session.data?.url) {
    console.error('Checkout session failed', session.status, JSON.stringify(session.data).slice(0, 400));
    return Response.json({ error: "We couldn't start checkout. Please try again." }, { status: 502 });
  }

  return Response.json({ url: session.data.url, trial: trialEligible && trialDays > 0 });
});
