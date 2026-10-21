// Opens Stripe's customer portal so a web subscriber can cancel, switch plan or update their card. Returns { url }.
// Only for people who already have a Stripe customer record (i.e. have started a web subscription).
// The portal itself must be switched on once in the Stripe dashboard (Settings > Billing > Customer portal).
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
  const userId = callerData.user.id;

  if (!(await checkRateLimit(`user:${userId}`, 'stripe_portal', 30, 60))) {
    return Response.json({ error: 'Too many attempts - try again in a little while.' }, { status: 429 });
  }

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return Response.json({ error: 'Managing your subscription is not available yet.' }, { status: 503 });

  const admin = createSupabaseAdmin();
  const { data: row } = await admin.from('stripe_subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle();
  if (!row?.stripe_customer_id) {
    return Response.json({ error: "You don't have a web subscription to manage." }, { status: 404 });
  }

  const session = await stripeRequest(secretKey, 'POST', '/billing_portal/sessions', {
    customer: row.stripe_customer_id,
    return_url: `${APP_URL}/subscription`,
  });
  if (!session.ok || !session.data?.url) {
    console.error('Portal session failed', session.status, JSON.stringify(session.data).slice(0, 400));
    return Response.json({ error: "We couldn't open your subscription settings. Please try again." }, { status: 502 });
  }
  return Response.json({ url: session.data.url });
});
