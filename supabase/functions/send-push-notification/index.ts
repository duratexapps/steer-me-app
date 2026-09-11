// Invoked directly via pg_net from public.send_push_via_edge_function()
// (migration 0047_draw_pro_entry_cancellation.sql), the same
// vault-secret + net.http_post idiom already established by
// notify_ban_suspended_user() (migration 0014_ban_suspended_webhook.sql).
// Generic on purpose - any future SECURITY DEFINER function that has
// already authorized who gets notified and why can call
// send_push_via_edge_function() rather than growing its own copy of the
// "look up expo_push_token, POST to Expo" logic already duplicated once
// in draw-pro-results-webhook/index.ts.
//
// Deliberately NOT invokable by the client SDK directly (verify_jwt is
// off, but the shared secret gate below is the real boundary) - a plain
// "send a push to any userId" endpoint reachable by any authenticated
// user would be a spam vector. The only legitimate caller is Postgres
// itself, via the vault-secret-gated pg_net call.
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  // FIXED live 2026-08-17, security review finding: `secret &&` meant a
  // missing/misconfigured DB_WEBHOOK_SECRET made this check a no-op - see
  // ban-suspended-user/index.ts's matching comment for the full reasoning.
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // NEW, added 2026-08-19 alongside migration 0058 - optional structured
  // payload so a tap on the notification can act, not just inform (see
  // app/partner-cancelled.tsx and the notification-response listener in
  // app/_layout.tsx). Every existing caller omits this and keeps working
  // unchanged - Expo's push API simply omits `data` from the delivered
  // payload when it's undefined.
  let payload: { userId?: string; title?: string; body?: string; data?: Record<string, unknown> | null };
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!payload.userId || !payload.title || !payload.body) {
    return new Response('Missing userId/title/body', { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('expo_push_token')
    .eq('id', payload.userId)
    .maybeSingle();

  if (error) {
    console.error('[send-push-notification] profile lookup failed', payload.userId, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!profile?.expo_push_token) {
    // Not an error - no token yet (never granted permission, or never
    // opened the app on this device) is a normal, common state.
    return Response.json({ sent: false, reason: 'no push token' });
  }

  const res = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: payload.title,
      body: payload.body,
      ...(payload.data ? { data: payload.data } : {}),
    }),
  });

  if (!res.ok) {
    console.error('[send-push-notification] Expo push API responded', res.status, await res.text());
    return Response.json({ sent: false, reason: 'expo api error' }, { status: 502 });
  }

  return Response.json({ sent: true });
});
