// Starts a Stripe Checkout (one-time payment, mode=payment) to FEATURE a listing: a clinic or school (events row with
// is_clinic) or a layover spot / hotel (layover_spots row). The caller must be signed in and own the listing. Returns
// { url } and the browser goes there. The stripe-webhook function marks the purchase paid and sets featured_until.
//
// Safety rails:
//  * Does nothing until app_settings.featured_listings_enabled is true.
//  * The price and the number of days come from app_settings (featured_price_clinic_cents / featured_price_stop_cents /
//    featured_days), never from the caller.
//  * Only the owner of the listing can buy it: events.producer_id (and the event must be a clinic) or
//    layover_spots.owner_id. A rejected layover listing cannot be featured.
//  * Card only. The price is sent as price_data, so no product has to be created in the Stripe dashboard.
//
// Secrets: STRIPE_SECRET_KEY (same one the subscription functions use). Optional: APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { serveWithCors } from '../_shared/cors.ts';
import { APP_URL, stripeRequest } from '../_shared/stripe.ts';

serveWithCors(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
  const callerClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const user = callerData.user;

  if (!(await checkRateLimit(`user:${user.id}`, 'stripe_featured_checkout', 20, 60))) {
    return Response.json({ error: 'Too many attempts - try again in a little while.' }, { status: 429 });
  }

  let body: { target_type?: string; target_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const targetType = body.target_type;
  const targetId = body.target_id;
  if ((targetType !== 'event' && targetType !== 'layover_spot') || !targetId) {
    return Response.json({ error: 'Choose a listing to feature.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: settings } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['featured_listings_enabled', 'featured_price_clinic_cents', 'featured_price_stop_cents', 'featured_days']);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  if (s.featured_listings_enabled !== true) {
    return Response.json({ error: 'Featured listings are not open yet.' }, { status: 409 });
  }
  const days = Number(s.featured_days ?? 30);
  const amount = Number(targetType === 'event' ? s.featured_price_clinic_cents ?? 2500 : s.featured_price_stop_cents ?? 2500);
  if (!Number.isInteger(amount) || amount < 50 || !Number.isInteger(days) || days < 1) {
    console.error('Bad featured settings', JSON.stringify(s));
    return Response.json({ error: 'Featured listings are not available right now.' }, { status: 503 });
  }

  // Ownership: only the person who posted the listing can pay to feature it.
  let listingName: string | null = null;
  if (targetType === 'event') {
    const { data: ev } = await admin.from('events').select('name, producer_id, is_clinic, status').eq('id', targetId).maybeSingle();
    if (!ev || ev.producer_id !== user.id || !ev.is_clinic || ev.status === 'removed') {
      return Response.json({ error: "You can only feature your own clinic or school." }, { status: 403 });
    }
    listingName = ev.name;
  } else {
    const { data: spot } = await admin.from('layover_spots').select('name, owner_id, review_status').eq('id', targetId).maybeSingle();
    if (!spot || spot.owner_id !== user.id || spot.review_status === 'rejected') {
      return Response.json({ error: "You can only feature your own layover spot or hotel." }, { status: 403 });
    }
    listingName = spot.name;
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return Response.json({ error: 'Featuring is not available yet. Please try again later.' }, { status: 503 });

  const { data: purchase, error: purchaseError } = await admin
    .from('featured_purchases')
    .insert({ user_id: user.id, target_type: targetType, target_id: targetId, amount_cents: amount, days })
    .select('id')
    .single();
  if (purchaseError || !purchase) {
    console.error('Purchase row failed', purchaseError?.message);
    return Response.json({ error: "We couldn't start checkout. Please try again." }, { status: 500 });
  }

  const session = await stripeRequest(secretKey, 'POST', '/checkout/sessions', {
    mode: 'payment',
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    payment_method_types: ['card'],
    // A promotion code (for example a 100%-off code for an early instructor) is allowed; Stripe then reports
    // payment_status 'no_payment_required', which the webhook treats as paid.
    allow_promotion_codes: 'true',
    custom_text: {
      submit: {
        message: `Your listing is featured for ${days} days from payment. If we can't approve your listing we will refund you.`,
      },
    },
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `Featured listing for ${days} days: ${listingName}` },
        },
        quantity: 1,
      },
    ],
    metadata: { kind: 'featured', purchase_id: purchase.id, target_type: targetType, target_id: targetId, days: String(days) },
    payment_intent_data: { metadata: { kind: 'featured', purchase_id: purchase.id } },
    success_url: `${APP_URL}/producer?featured=success`,
    cancel_url: `${APP_URL}/producer?featured=cancelled`,
  });

  if (!session.ok || !session.data?.url) {
    console.error('Featured checkout session failed', session.status, JSON.stringify(session.data).slice(0, 400));
    await admin.from('featured_purchases').delete().eq('id', purchase.id);
    return Response.json({ error: "We couldn't start checkout. Please try again." }, { status: 502 });
  }

  await admin.from('featured_purchases').update({ stripe_session_id: session.data.id }).eq('id', purchase.id);
  return Response.json({ url: session.data.url });
});
