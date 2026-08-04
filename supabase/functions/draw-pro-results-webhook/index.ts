// Draw Pro -> Steer Me: pushes team assignments and round-by-round results
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
// REWRITTEN 2026-08-04 for migration 0045_draw_pro_multi_team_entries.sql -
// a Steer Me user can land on more than one team for the same event (a
// solo Draw Pro entrant with multiple draw-in slots), so team_number moved
// off draw_pro_entry_links onto a new draw_pro_entry_link_teams table, and
// draw_pro_round_results now keys off THAT instead of the link directly.
// Every recognized payload shape now carries teamNumber, not just token:
//   { token, teamNumber, partnerName?, partnerClassificationNumber?,
//     partnerRole? } - matching-engine.jsw's executeDraw(), via
//     pushTeamNumbers(). Upserts the (link, teamNumber) team row.
//   { token, teamNumber, round, noTime, rawTime, brokenBarrier,
//     oneLegCatch, penaltySeconds, finalTime } - roundResults.jsw's
//     saveRoundResults(), via pushRoundResults(). teamNumber says which of
//     the person's teams this round result belongs to.
// Draw Pro computes penaltySeconds/finalTime itself (it owns the
// barrier-type/penalty rules) - this function only stores what it's told,
// never recomputes.
//
// Notifications: reads profiles.expo_push_token (migration
// 0044_profile_push_token.sql) and calls Expo's push API directly via
// fetch - same "call the HTTP API directly, no SDK needed" idiom already
// used by get-town-distance for Google's API, since expo-server-sdk is a
// Node package with no Deno/Edge Function build. Fire-and-forget: a
// missing/invalid token or a failed push call never fails the underlying
// data update, which already succeeded by the time a notification is even
// attempted.
//
// A team-assignment call sends a notification listing the FULL current set
// of that person's teams for the event (not just the one just written),
// since a multi-slot entrant's several teams are usually all assigned in
// the same executeDraw() run - each call's notification is self-contained
// and correct on its own. Trade-off: someone with 3 teams assigned at once
// gets up to 3 notifications in quick succession, each showing the
// complete (by-then-current) list, rather than exactly one summary
// notification - true batching would need a queue/delay this
// request-response function doesn't have. Acceptable given the
// alternative (showing only the single team just written) would be
// actively wrong once a second team lands moments later.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

type WebhookPayload = {
  token?: string;
  teamNumber?: number;
  partnerName?: string | null;
  partnerClassificationNumber?: number | null;
  partnerRole?: 'header' | 'heeler' | null;
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
  if (body.teamNumber == null) {
    // Not an error - every currently-recognized payload shape carries a
    // teamNumber, so a call without one simply has nothing to act on (Draw
    // Pro may reasonably call this again later with a fuller payload).
    return Response.json({ skipped: 'no recognized fields in payload' });
  }

  const supabaseAdmin = createSupabaseAdmin();

  const { data: link, error: linkError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id, steer_me_user_id, event_id, events(name)')
    .eq('token', body.token)
    .maybeSingle();

  if (linkError) {
    console.error('[draw-pro-results-webhook] link lookup failed', body.token, linkError);
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
    const { error: teamError } = await supabaseAdmin.from('draw_pro_entry_link_teams').upsert(
      {
        entry_link_id: link.id,
        team_number: body.teamNumber,
        partner_name: body.partnerName ?? null,
        partner_classification_number: body.partnerClassificationNumber ?? null,
        partner_role: body.partnerRole ?? null,
      },
      { onConflict: 'entry_link_id,team_number' }
    );
    if (teamError) {
      console.error('[draw-pro-results-webhook] team upsert failed', body.token, teamError);
      return Response.json({ error: teamError.message }, { status: 500 });
    }

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('draw_pro_entry_link_teams')
      .select('team_number, partner_name, partner_classification_number')
      .eq('entry_link_id', link.id)
      .order('team_number', { ascending: true });

    if (teamsError) {
      console.error('[draw-pro-results-webhook] teams list failed', body.token, teamsError);
    } else if (teams && teams.length > 0) {
      const lines = teams.map((t) => {
        const partner =
          t.partner_name != null
            ? `${t.partner_name}${t.partner_classification_number != null ? ` (${t.partner_classification_number})` : ''}`
            : 'partner TBD';
        return `Team #${t.team_number} — ${partner}`;
      });
      sendPushNotification(
        supabaseAdmin,
        link.steer_me_user_id,
        teams.length > 1 ? `Your teams for ${eventName}` : `Your team for ${eventName}`,
        lines.join('\n')
      ).catch((err) => console.error('[draw-pro-results-webhook] push send failed', err));
    }

    return Response.json({ found: true, linkId: link.id, teamNumber: body.teamNumber });
  }

  // Round-result call - resolve which of this person's teams it belongs to.
  const { data: team, error: teamLookupError } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, team_number')
    .eq('entry_link_id', link.id)
    .eq('team_number', body.teamNumber)
    .maybeSingle();
  if (teamLookupError) {
    console.error('[draw-pro-results-webhook] team lookup failed', body.token, teamLookupError);
    return Response.json({ error: teamLookupError.message }, { status: 500 });
  }
  if (!team) {
    // Same non-fatal shape as the "no link found" case above - a round
    // result arriving for a team-assignment that was never pushed (or
    // whose row was later removed) shouldn't look catastrophic on Draw
    // Pro's side, which already logs-and-swallows non-2xx responses.
    console.warn('[draw-pro-results-webhook] no team found for token/teamNumber', body.token, body.teamNumber);
    return Response.json({ found: false }, { status: 404 });
  }

  const { error: resultError } = await supabaseAdmin.from('draw_pro_round_results').upsert(
    {
      entry_link_team_id: team.id,
      round: body.round,
      no_time: !!body.noTime,
      raw_time: body.rawTime ?? null,
      broken_barrier: !!body.brokenBarrier,
      one_leg_catch: !!body.oneLegCatch,
      penalty_seconds: body.penaltySeconds ?? 0,
      final_time: body.finalTime ?? null,
    },
    { onConflict: 'entry_link_team_id,round' }
  );

  if (resultError) {
    console.error('[draw-pro-results-webhook] round result upsert failed', body.token, resultError);
    return Response.json({ error: resultError.message }, { status: 500 });
  }

  const teamLabel = ` — Team #${team.team_number}`;
  const notification = body.noTime
    ? { title: 'Eliminated', body: `You've been eliminated after Round ${body.round}${teamLabel}` }
    : {
        title: `Round ${body.round} result`,
        body: `${body.finalTime != null ? `${body.finalTime}s` : 'Result recorded'}${teamLabel} at ${eventName}`,
      };
  sendPushNotification(supabaseAdmin, link.steer_me_user_id, notification.title, notification.body).catch((err) =>
    console.error('[draw-pro-results-webhook] push send failed', err)
  );

  return Response.json({ found: true, linkId: link.id, round: body.round, teamNumber: body.teamNumber });
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
