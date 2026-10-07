// Redeems a single-use promo code for free subscription time (migration
// 0072). The caller must be a signed-in Steer Me user. The code is claimed
// atomically first (UPDATE ... WHERE redeemed_at IS NULL), then the free time
// is granted through RevenueCat's Promotional Entitlements API; if that grant
// fails the claim is released so the person can try again. RevenueCat's webhook
// (revenuecat-webhook) writes the resulting entitlement into `subscriptions` -
// this function never writes that table.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { serveWithCors } from '../_shared/cors.ts';

const RC_ENTITLEMENT_ID = 'Steer Me';
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

serveWithCors(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
  const callerClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const userId = callerData.user.id;

  // Guessing ceiling, not a real usage cap.
  if (!(await checkRateLimit(`user:${userId}`, 'redeem_promo_code', 10, 1440))) {
    return Response.json({ error: 'Too many attempts - try again tomorrow.' }, { status: 429 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const code = (body.code ?? '').trim().toUpperCase();
  if (!code || code.length > 40) return Response.json({ error: 'Enter your code.' }, { status: 400 });

  const admin = createSupabaseAdmin();

  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'paywall_enabled').maybeSingle();
  if (setting?.value !== true) {
    return Response.json({ error: "Codes can be redeemed once subscriptions start. We'll let you know the day." }, { status: 409 });
  }

  const { data: row } = await admin.from('promo_codes').select('*').eq('code', code).maybeSingle();
  // One generic message for unknown / already used / someone else's / expired, so codes can't be probed.
  const invalid = () => Response.json({ error: "That code isn't valid. Check it and try again." }, { status: 404 });
  if (!row || row.redeemed_at) return invalid();
  if (row.assigned_user_id && row.assigned_user_id !== userId) return invalid();
  if (row.expires_at && new Date(row.expires_at) < new Date()) return invalid();

  const apiKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!apiKey) return Response.json({ error: 'Redeeming is not available yet. Please try again later.' }, { status: 503 });

  // Claim first so two taps can't both succeed.
  const { data: claimed } = await admin
    .from('promo_codes')
    .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
    .eq('code', code)
    .is('redeemed_at', null)
    .select('code');
  if (!claimed?.length) return invalid();

  // RevenueCat only knows a user once the mobile SDK has configured with their id, so a web-only or
  // never-opened-purchases account is "not found" for promotional grants. Fetching the subscriber
  // creates it if missing (RevenueCat's get-or-create endpoint).
  await fetch(`${REVENUECAT_API_BASE}/subscribers/${userId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  }).catch(() => null);

  const grant = await fetch(`${REVENUECAT_API_BASE}/subscribers/${userId}/entitlements/${RC_ENTITLEMENT_ID}/promotional`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: row.duration }),
  }).catch(() => null);

  if (!grant || !grant.ok) {
    const detail = await grant?.text().catch(() => '');
    console.error('Promo grant failed', code, grant?.status, detail);
    await admin.from('promo_codes').update({ redeemed_by: null, redeemed_at: null }).eq('code', code);
    return Response.json({ error: "We couldn't apply your code just now. Please try again in a minute." }, { status: 502 });
  }

  return Response.json({ ok: true, duration: row.duration });
});
