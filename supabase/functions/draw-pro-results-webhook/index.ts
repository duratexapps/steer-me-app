// Draw Pro -> Steer Me: pushes a team number and round-by-round results
// back onto the draw_pro_entry_links row a user's own "Enter the Draw" tap
// created (see migration 0042_draw_pro_entry_links.sql and
// src/hooks/useEntryHandoff.ts's useCreateDrawProEntryLink()). This is the
// mirror image of steerMeSync.jsw's event sync: that one is Draw Pro
// pushing event data IN; this is Draw Pro pushing per-entrant results back
// OUT once a draw runs (and once round results are entered), keyed by the
// opaque `token` Draw Pro stored on the entrant record as
// steerMeEntryLinkToken.
//
// Auth pattern mirrors revenuecat-webhook: a shared-secret Authorization
// header, not a Supabase user session, since the caller is Draw Pro's own
// Wix backend (backend/steerMeResultsSync.jsw), not a Steer Me user.
// Configure the deployed function's URL + DRAW_PRO_WEBHOOK_AUTH's value in
// Wix Secrets Manager under the same name steerMeResultsSync.jsw reads
// (see supabase/RUNBOOK.md).
//
// Two independent payload shapes, sent at different times by Draw Pro -
// a single call may carry either, both, or neither recognized field:
//   { token, teamNumber } - matching-engine.jsw's executeDraw()
//   { token, round, noTime, rawTime, brokenBarrier, oneLegCatch,
//     penaltySeconds, finalTime } - roundResults.jsw's saveRoundResults().
// Draw Pro computes penaltySeconds/finalTime itself (it owns the
// barrier-type/penalty rules) - this function only stores what it's told,
// never recomputes.
//
// NEW, added 2026-07-31 - also pushes a real device notification for each
// of the three trigger cases (team number assigned, round result posted,
// eliminated), reading profiles.expo_push_token (migration
// 0044_profile_push_token.sql) and calling Expo's push API directly via
// fetch - same "call the HTTP API directly, no SDK needed" idiom already
// used by get-town-distance for Google's API, since expo-server-sdk is a
// Node package with no Deno/Edge Function build. Fire-and-forget: a
// missing/invalid token or a failed push call never fails the underlying
// data update, which already succeeded by the time a notification is even
// attempted.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

type WebhookPayload = {
  token?: string;
  teamNumber?: number;
  round?: number;
  noTime?: boolean;
  rawTime?: number | null;
  brokenBarrier?: boolean;
  oneLegCatch?: boolean;
  penaltySeconds?: number;
  finalTime?: number | null;
};

Deno.serve(async (req) => {
  const expectedAuth = Deno.env.get('DRAW_PRO_WEBHOOK_AUTH');
  if (expectedAuth && req.headers.get('authorization') !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!body.token) {
    return new Response('Missing token', { status: 400 });
  }

  if (body.teamNumber == null && body.round == null) {
    // Not an error - Draw Pro may reasonably call this again later with
    // additional fields as the same team progresses through an event.
    return Response.json({ skipped: 'no recognized fields in payload' });
  }

  const supabaseAdmin = createSupabaseAdmin();

  // CONFIRMED live: PostgREST's PATCH with an empty {} body returns ZERO
  // rows (200, empty array) even when the filter matches an existing row
  // - not a no-op update as you'd expect. A round-only payload has
  // nothing to set on draw_pro_entry_links itself (team_number is
  // untouched), so this must plain-SELECT instead of calling .update({})
  // in that case, or every round-only call would wrongly report the
  // token as not found.
  //
  // team_number and events(name) are both selected regardless of which
  // branch ran - needed for the notification copy below even on a
  // round-only call, where team_number itself isn't being written this
  // time but was already set by an earlier team-number push.
  const linkSelectCols = 'id, steer_me_user_id, event_id, team_number, events(name)';
  const { data: link, error: linkError } =
    body.teamNumber != null
      ? await supabaseAdmin
          .from('draw_pro_entry_links')
          .update({ team_number: body.teamNumber })
          .eq('token', body.token)
          .select(linkSelectCols)
          .maybeSingle()
      : await supabaseAdmin.from('draw_pro_entry_links').select(linkSelectCols).eq('token', body.token).maybeSingle();

  if (linkError) {
    console.error('[draw-pro-results-webhook] link update failed', body.token, linkError);
    return Response.json({ error: linkError.message }, { status: 500 });
  }
  if (!link) {
    // Not a hard error - the token could be stale (link row deleted via
    // event/profile cascade) or simply wrong. Draw Pro's own
    // steerMeResultsSync.jsw already logs-and-swallows on any non-2xx, so
    // this doesn't need to look catastrophic on that side either.
    console.warn('[draw-pro-results-webhook] no entry link found for token', body.token);
    return Response.json({ found: false }, { status: 404 });
  }

  // events(name) comes back as an array or single object depending on the
  // supabase-js version's embed shape - handle both rather than guessing.
  const eventRecord = Array.isArray(link.events) ? link.events[0] : link.events;
  const eventName: string = eventRecord?.name ?? 'your event';

  if (body.round == null) {
    if (body.teamNumber != null) {
      sendPushNotification(
        supabaseAdmin,
        link.steer_me_user_id,
        'Team number assigned',
        `Your team number for ${eventName} is #${body.teamNumber}`
      ).catch((err) => console.error('[draw-pro-results-webhook] push send failed', err));
    }
    return Response.json({ found: true, linkId: link.id, teamNumber: body.teamNumber });
  }

  const { error: resultError } = await supabaseAdmin
    .from('draw_pro_round_results')
    .upsert(
      {
        entry_link_id: link.id,
        round: body.round,
        no_time: !!body.noTime,
        raw_time: body.rawTime ?? null,
        broken_barrier: !!body.brokenBarrier,
        one_leg_catch: !!body.oneLegCatch,
        penalty_seconds: body.penaltySeconds ?? 0,
        final_time: body.finalTime ?? null,
      },
      { onConflict: 'entry_link_id,round' }
    );

  if (resultError) {
    console.error('[draw-pro-results-webhook] round result upsert failed', body.token, resultError);
    return Response.json({ error: resultError.message }, { status: 500 });
  }

  const teamLabel = link.team_number != null ? ` — Team #${link.team_number}` : '';
  const notification = body.noTime
    ? { title: 'Eliminated', body: `You've been eliminated after Round ${body.round}${teamLabel}` }
    : {
        title: `Round ${body.round} result`,
        body: `${body.finalTime != null ? `${body.finalTime}s` : 'Result recorded'}${teamLabel} at ${eventName}`,
      };
  sendPushNotification(supabaseAdmin, link.steer_me_user_id, notification.title, notification.body).catch((err) =>
    console.error('[draw-pro-results-webhook] push send failed', err)
  );

  return Response.json({ found: true, linkId: link.id, round: body.round });
});

async function sendPushNotification(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  steerMeUserId: string,
  title: string,
  body: string
) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('expo_push_token')
    .eq('id', steerMeUserId)
    .maybeSingle();

  if (error || !profile?.expo_push_token) return;

  const res = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: profile.expo_push_token, title, body }),
  });
  if (!res.ok) {
    console.error('[draw-pro-results-webhook] Expo push API responded', res.status, await res.text());
  }
}
