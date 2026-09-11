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
//
// EXTENDED 2026-08-05 for migration 0046_draw_pro_extra_run_charges.sql -
// real business concept confirmed directly by the producer: a manual
// pairing on the Draw Pro side can knowingly give someone an "extra run"
// beyond what they already paid for (headerIsExtraRun/heelerIsExtraRun on
// DrawProTeams). That person needs to be told and given a real pay/decline
// choice in the app - see choose_extra_run_payment() in migration 0046.
// Draw Pro then needs to read that choice back, which is what the new
// getExtraRunStatuses batch action below is for (Draw Pro has no
// standing knowledge of this database's internal ids, only its own
// token/teamNumber pairs, so the lookup works from those).
//
// Every recognized payload shape now carries teamNumber (or is the
// distinct batch-lookup action below), not just token:
//   { token, teamNumber, totalTeams?, partnerName?, partnerClassificationNumber?,
//     partnerRole?, extraRun?, extraRunFeeAmount? } - matching-engine.jsw's
//     executeDraw()/manualPairEntrants(), via pushTeamNumbers(). Upserts
//     the (link, teamNumber) team row, and - if extraRun is true - creates
//     a pending charge for it (idempotent: one charge per team, a repeat
//     call never resets an already-decided one).
//   { token, teamNumber, round, noTime, rawTime, brokenBarrier,
//     oneLegCatch, penaltySeconds, finalTime } - roundResults.jsw's
//     saveRoundResults(), via pushRoundResults(). teamNumber says which of
//     the person's teams this round result belongs to.
//   { action: 'getExtraRunStatuses', lookups: [{token, teamNumber}, ...] } -
//     Draw Pro polling for pay/decline decisions to display on the
//     producer's own draw sheet. No auth-header bypass here - same shared
//     secret as every other call.
// Draw Pro computes penaltySeconds/finalTime/extraRunFeeAmount itself (it
// owns the barrier-type/penalty/pricing rules) - this function only stores
// what it's told, never recomputes.
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
  action?:
    | 'getExtraRunStatuses'
    | 'getCancellationRequests'
    | 'confirmCancellation'
    | 'registerSubmission'
    // NEW, added for real standings - a "you're now in Nth place" push
    // fired once a round becomes fully complete on Draw Pro's side. A
    // distinct explicit action rather than folding into the implicit
    // token+teamNumber+round round-result shape below - that shape is
    // structurally tied to writing draw_pro_round_results, and a standing
    // isn't a recorded run, it must never trigger that write.
    | 'pushRoundStandings';
  lookups?: { token: string; teamNumber: number }[];
  // NEW, added 2026-08-06 for migration 0047_draw_pro_entry_cancellation.sql
  // - drawProEventId is Draw Pro's OWN event id (a Wix string), not this
  // database's internal events.id - resolved via events.draw_pro_event_id,
  // same cross-reference steerMeSync.jsw already writes on sync.
  drawProEventId?: string;
  token?: string;
  // NEW, added 2026-08-06 for migration 0048_draw_pro_per_entry_tracking.sql
  // - registerSubmission's own payload fields (entryType/requestedRunCount),
  // and entryId, which a team-assignment call now optionally carries to say
  // "this is the FIRST team for an already-registered pending entry, update
  // THAT row in place" rather than blind-upserting a new one by
  // (entry_link_id, team_number) - see the team-assignment branch below for
  // why that distinction matters now that team_number can start out null.
  entryType?: 'draw_in' | 'preformed_team';
  requestedRunCount?: number;
  entryId?: string;
  teamNumber?: number;
  // NEW, added 2026-08-09 for migration 0049_team_number_of_total.sql -
  // real gap flagged directly by the user: "Team #54" alone doesn't say
  // how big the field is. Draw Pro computes this as a fresh count query
  // (not derived here), so it's always the true current team count for
  // the class at push time.
  totalTeams?: number | null;
  partnerName?: string | null;
  partnerClassificationNumber?: number | null;
  partnerRole?: 'header' | 'heeler' | null;
  extraRun?: boolean;
  extraRunFeeAmount?: number | null;
  round?: number;
  noTime?: boolean;
  rawTime?: number | null;
  brokenBarrier?: boolean;
  oneLegCatch?: boolean;
  penaltySeconds?: number;
  finalTime?: number | null;
  // NEW - pushRoundStandings' own fields, alongside the token/teamNumber/
  // round fields already above.
  rank?: number;
  totalActiveTeams?: number;
};

Deno.serve(async (req) => {
  // FIXED live 2026-08-12, security review finding #3: `expectedAuth &&`
  // meant a missing/misconfigured DRAW_PRO_WEBHOOK_AUTH secret made this
  // check a no-op - EVERY request would be accepted with no auth at all
  // (fail-open) instead of being rejected (fail-closed). Currently
  // configured (confirmed live in the secrets list), so not actively
  // exploitable today, but a rotated-and-forgotten secret would have
  // silently opened this endpoint to the public internet. Now rejects
  // whenever the secret isn't configured OR doesn't match, same as
  // revenuecat-webhook should also be checked for (this file's own header
  // comment says its auth pattern was copied from there).
  const expectedAuth = Deno.env.get('DRAW_PRO_WEBHOOK_AUTH');
  if (!expectedAuth || req.headers.get('authorization') !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();

  if (body.action === 'getExtraRunStatuses') {
    return handleGetExtraRunStatuses(supabaseAdmin, body.lookups ?? []);
  }

  if (body.action === 'getCancellationRequests') {
    return handleGetCancellationRequests(supabaseAdmin, body.drawProEventId ?? '');
  }

  if (body.action === 'confirmCancellation') {
    return handleConfirmCancellation(supabaseAdmin, body.entryId ?? '');
  }

  if (body.action === 'registerSubmission') {
    return handleRegisterSubmission(supabaseAdmin, body.token ?? '', body.entryType, body.requestedRunCount);
  }

  if (body.action === 'pushRoundStandings') {
    return handlePushRoundStandings(supabaseAdmin, body);
  }

  // Any other non-empty action string is unrecognized, not implicit - reject
  // it here rather than falling through to the round-result/team-assignment
  // logic below. Without this, a typo'd or malformed action (still carrying
  // token+teamNumber+round, since that's a strict subset of the standings
  // payload shape) would silently be treated as a real round-result call and
  // overwrite a live result with final_time: null.
  if (body.action) {
    return new Response(`Unknown action: ${body.action}`, { status: 400 });
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
    // NEW, added 2026-08-06 for migration 0048_draw_pro_per_entry_tracking.sql
    // - if this team-assignment call carries entryId, it's normally
    // graduating an already-registered pending entry (team_number was null
    // since registerSubmission created it) into its now-assigned team - an
    // UPDATE by id, not the old upsert-by-(entry_link_id, team_number),
    // which would otherwise INSERT a brand new row (since no row exists yet
    // with this team_number) and leave the original pending row orphaned
    // forever with team_number still null.
    //
    // But a multi-run submission (requestedEntryCount > 1) can expand into
    // SEVERAL teams from the SAME one entrant record - Draw Pro's
    // pushTeamNumbers() has no way to know which of those calls is "the
    // first" for a given entrant, so every one of them carries the same
    // entryId. Checking whether that row's team_number is STILL null
    // distinguishes the two cases without Draw Pro needing to track
    // anything: null means this is genuinely the first team for this
    // entry (update in place); already-set means a previous call already
    // claimed it, so this is an ADDITIONAL team from the same submission
    // and needs its own new row instead of overwriting the first one's
    // team_number. No entryId at all (a legacy entrant that never called
    // registerSubmission) falls straight to the same upsert-by-natural-key
    // fallback used for that additional-team case.
    let existingEntry: { team_number: number | null } | null = null;
    if (body.entryId) {
      const { data, error: existingError } = await supabaseAdmin
        .from('draw_pro_entry_link_teams')
        .select('team_number')
        .eq('id', body.entryId)
        .maybeSingle();
      if (existingError) {
        console.error('[draw-pro-results-webhook] entry lookup failed', body.token, existingError);
        return Response.json({ error: existingError.message }, { status: 500 });
      }
      existingEntry = data;
    }

    const teamFields = {
      team_number: body.teamNumber,
      total_teams: body.totalTeams ?? null,
      partner_name: body.partnerName ?? null,
      partner_classification_number: body.partnerClassificationNumber ?? null,
      partner_role: body.partnerRole ?? null,
    };
    const teamQuery =
      body.entryId && existingEntry && existingEntry.team_number == null
        ? supabaseAdmin.from('draw_pro_entry_link_teams').update(teamFields).eq('id', body.entryId).select('id').single()
        : supabaseAdmin
            .from('draw_pro_entry_link_teams')
            .upsert({ entry_link_id: link.id, ...teamFields }, { onConflict: 'entry_link_id,team_number' })
            .select('id')
            .single();
    const { data: upsertedTeam, error: teamError } = await teamQuery;
    if (teamError) {
      console.error('[draw-pro-results-webhook] team upsert failed', body.token, teamError);
      return Response.json({ error: teamError.message }, { status: 500 });
    }

    // NEW, 2026-08-05 - see this file's header comment. ignoreDuplicates
    // means a repeat call for the same team (e.g. a retried request) never
    // resets an already-decided charge back to pending - the unique
    // constraint on entry_link_team_id makes this safe as a plain upsert.
    if (body.extraRun && body.extraRunFeeAmount != null) {
      const { error: chargeError } = await supabaseAdmin
        .from('draw_pro_extra_run_charges')
        .upsert(
          { entry_link_team_id: upsertedTeam.id, fee_amount: body.extraRunFeeAmount },
          { onConflict: 'entry_link_team_id', ignoreDuplicates: true }
        );
      if (chargeError) {
        console.error('[draw-pro-results-webhook] extra-run charge upsert failed', body.token, chargeError);
      } else {
        sendPushNotification(
          supabaseAdmin,
          link.steer_me_user_id,
          `Extra run — Team #${body.teamNumber}`,
          `You've been given an extra run for ${eventName} (Team #${body.teamNumber}). ` +
            `Open Steer Me to pay the $${body.extraRunFeeAmount.toFixed(2)} fee or decline it.`
        ).catch((err) => console.error('[draw-pro-results-webhook] extra-run push failed', err));
      }
    }

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('draw_pro_entry_link_teams')
      .select('team_number, total_teams, partner_name, partner_classification_number')
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
        const teamLabel = t.total_teams != null ? `Team #${t.team_number} of ${t.total_teams}` : `Team #${t.team_number}`;
        return `${teamLabel} — ${partner}`;
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
    .select('id, team_number, total_teams')
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

  const teamLabel = team.total_teams != null ? ` — Team #${team.team_number} of ${team.total_teams}` : ` — Team #${team.team_number}`;
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// NEW - round standings notification. Distinct from the round-result
// branch above: this never writes to draw_pro_round_results (a standing
// isn't a recorded run), it only resolves token -> steer_me_user_id and
// notifies. Draw Pro computes rank/totalActiveTeams itself and only ever
// calls this for teams currently in the top 20 - no ranking or filtering
// happens on this side.
async function handlePushRoundStandings(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  body: WebhookPayload
) {
  if (!body.token || body.teamNumber == null || body.rank == null || body.round == null) {
    return new Response('Missing token, teamNumber, round, or rank', { status: 400 });
  }

  const { data: link, error: linkError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id, steer_me_user_id, event_id, events(name)')
    .eq('token', body.token)
    .maybeSingle();

  if (linkError) {
    console.error('[draw-pro-results-webhook] pushRoundStandings link lookup failed', body.token, linkError);
    return Response.json({ error: linkError.message }, { status: 500 });
  }
  if (!link) {
    console.warn('[draw-pro-results-webhook] pushRoundStandings no link for token', body.token);
    return Response.json({ found: false }, { status: 404 });
  }

  const eventRecord = Array.isArray(link.events) ? link.events[0] : link.events;
  const eventName: string = eventRecord?.name ?? 'your event';

  const { data: team } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('team_number, total_teams')
    .eq('entry_link_id', link.id)
    .eq('team_number', body.teamNumber)
    .maybeSingle();
  const teamLabel = team?.total_teams != null
    ? ` — Team #${body.teamNumber} of ${team.total_teams}`
    : ` — Team #${body.teamNumber}`;

  const rankText = ordinal(body.rank);
  const fieldText = body.totalActiveTeams != null ? ` of ${body.totalActiveTeams}` : '';
  sendPushNotification(
    supabaseAdmin,
    link.steer_me_user_id,
    `Round ${body.round} standings — ${rankText} place`,
    `You're sitting ${rankText}${fieldText} after Round ${body.round} at ${eventName}${teamLabel}.`
  ).catch((err) => console.error('[draw-pro-results-webhook] pushRoundStandings push failed', err));

  return Response.json({ found: true, linkId: link.id, teamNumber: body.teamNumber, rank: body.rank });
}

// NEW, 2026-08-05 - see this file's header comment. Draw Pro has no
// standing knowledge of this database's internal ids (entry_link_id,
// entry_link_team_id) - only its own token/teamNumber pairs, the same
// identifiers every other call in this function already works from. Three
// queries instead of one round trip per lookup: fetch every relevant link,
// then every relevant team, then every relevant charge, all keyed by IN
// lists, then resolve each requested pair in memory - scales with the
// number of DISTINCT tokens/teams involved, not the number of pairs asked
// about.
async function handleGetExtraRunStatuses(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  lookups: { token: string; teamNumber: number }[]
) {
  if (lookups.length === 0) {
    return Response.json({ statuses: [] });
  }

  const tokens = [...new Set(lookups.map((l) => l.token))];
  const { data: links, error: linksError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id, token')
    .in('token', tokens);
  if (linksError) {
    console.error('[draw-pro-results-webhook] getExtraRunStatuses links lookup failed', linksError);
    return Response.json({ error: linksError.message }, { status: 500 });
  }
  const linkIdByToken = new Map((links ?? []).map((l) => [l.token, l.id]));
  const linkIds = [...linkIdByToken.values()];
  if (linkIds.length === 0) {
    return Response.json({ statuses: lookups.map((l) => ({ ...l, found: false })) });
  }

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, entry_link_id, team_number')
    .in('entry_link_id', linkIds);
  if (teamsError) {
    console.error('[draw-pro-results-webhook] getExtraRunStatuses teams lookup failed', teamsError);
    return Response.json({ error: teamsError.message }, { status: 500 });
  }
  const teamIdByLinkAndNumber = new Map((teams ?? []).map((t) => [`${t.entry_link_id}|${t.team_number}`, t.id]));
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) {
    return Response.json({ statuses: lookups.map((l) => ({ ...l, found: false })) });
  }

  const { data: charges, error: chargesError } = await supabaseAdmin
    .from('draw_pro_extra_run_charges')
    .select('entry_link_team_id, status, fee_amount')
    .in('entry_link_team_id', teamIds);
  if (chargesError) {
    console.error('[draw-pro-results-webhook] getExtraRunStatuses charges lookup failed', chargesError);
    return Response.json({ error: chargesError.message }, { status: 500 });
  }
  const chargeByTeamId = new Map((charges ?? []).map((c) => [c.entry_link_team_id, c]));

  const statuses = lookups.map((l) => {
    const linkId = linkIdByToken.get(l.token);
    const teamId = linkId != null ? teamIdByLinkAndNumber.get(`${linkId}|${l.teamNumber}`) : undefined;
    const charge = teamId != null ? chargeByTeamId.get(teamId) : undefined;
    if (!charge) {
      return { token: l.token, teamNumber: l.teamNumber, found: false };
    }
    return {
      token: l.token,
      teamNumber: l.teamNumber,
      found: true,
      status: charge.status,
      feeAmount: charge.fee_amount,
    };
  });

  return Response.json({ statuses });
}

// NEW, added 2026-08-06 for migration 0047_draw_pro_entry_cancellation.sql
// - the producer-facing pull half of the pre-draw cancellation flow. Draw
// Pro has no standing knowledge of this database's internal event id, only
// its own (a Wix string) - resolved via events.draw_pro_event_id, the same
// cross-reference steerMeSync.jsw already writes whenever it syncs an
// event. Called from the producer's Draw Sheet Review page so it can flag
// which unmatched entrants have asked to back out.
// REWRITTEN 2026-08-06 for migration 0048_draw_pro_per_entry_tracking.sql -
// cancellation_requested_at moved from draw_pro_entry_links (one per
// person+event, couldn't say WHICH of several entries) onto
// draw_pro_entry_link_teams (one per actual entry). Returns entryId now,
// not token - Draw Pro stores this exact id on the specific entrant
// record(s) that submission created (steerMeEntrySubmissionId), so it can
// flag/remove exactly the one entry that was requested instead of every
// entrant record sharing that person's per-event token.
async function handleGetCancellationRequests(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  drawProEventId: string
) {
  if (!drawProEventId) {
    return Response.json({ requests: [] });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('draw_pro_event_id', drawProEventId)
    .maybeSingle();
  if (eventError) {
    console.error('[draw-pro-results-webhook] getCancellationRequests event lookup failed', eventError);
    return Response.json({ error: eventError.message }, { status: 500 });
  }
  if (!event) {
    return Response.json({ requests: [] });
  }

  const { data: links, error: linksError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id')
    .eq('event_id', event.id);
  if (linksError) {
    console.error('[draw-pro-results-webhook] getCancellationRequests links lookup failed', linksError);
    return Response.json({ error: linksError.message }, { status: 500 });
  }
  const linkIds = (links ?? []).map((l) => l.id);
  if (linkIds.length === 0) {
    return Response.json({ requests: [] });
  }

  const { data: entries, error: entriesError } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, cancellation_requested_at')
    .in('entry_link_id', linkIds)
    .not('cancellation_requested_at', 'is', null);
  if (entriesError) {
    console.error('[draw-pro-results-webhook] getCancellationRequests entries lookup failed', entriesError);
    return Response.json({ error: entriesError.message }, { status: 500 });
  }

  return Response.json({
    requests: (entries ?? []).map((e) => ({ entryId: e.id, requestedAt: e.cancellation_requested_at })),
  });
}

// NEW, added 2026-08-06 for migration 0048_draw_pro_per_entry_tracking.sql -
// called from entrant-entry-form.js right after a real submission succeeds,
// so this entry has an identity from the moment it's made rather than only
// becoming visible once a team_number shows up. Returns the new row's id,
// which Draw Pro stores on the entrant record(s) that submission created
// (steerMeEntrySubmissionId) - the thing cancellation and later the
// team-assignment call (via entryId) both target precisely.
async function handleRegisterSubmission(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  token: string,
  entryType: 'draw_in' | 'preformed_team' | undefined,
  requestedRunCount: number | undefined
) {
  if (!token || !entryType) {
    return new Response('Missing token or entryType', { status: 400 });
  }

  const { data: entryId, error } = await supabaseAdmin.rpc('register_draw_pro_entry_submission', {
    p_token: token,
    p_entry_type: entryType,
    p_requested_run_count: requestedRunCount ?? 1,
  });

  if (error) {
    // Not fatal for Draw Pro's own submission flow - it already treats this
    // whole call as best-effort/fire-and-forget (see steerMeResultsSync.jsw)
    // since a failure here should never block someone from having entered.
    console.error('[draw-pro-results-webhook] registerSubmission failed', token, error);
    return Response.json({ found: false, error: error.message }, { status: 404 });
  }

  return Response.json({ found: true, entryId });
}

// REWRITTEN 2026-08-16 - real gap flagged directly by the producer's own
// live testing: a draw-in submission's requested_run_count can be >1 (one
// row here represents the WHOLE batch, e.g. "4 draw-in runs"), but this
// used to unconditionally DELETE the row on the very first call - so
// removing just 1 of 4 Draw Pro entrant records (via that side's "Remove
// One") wiped the entrant's entire Steer Me entry, not just one run of it.
// Draw Pro calls this once per entrant record it actually deletes (1:1
// with one real run), so this now decrements requested_run_count by 1 and
// only deletes the row once that reaches 0 - matching what Draw Pro
// actually removed instead of assuming "any removal call = the whole
// entry is gone." Also clears cancellation_requested_at on every partial
// decrement (not just full delete): the one outstanding request that
// prompted this removal has now been addressed, so the flag shouldn't
// keep showing on Draw Pro's side for the runs that are still active, and
// the entrant should be free to request cancelling another run if they
// still want out.
async function handleConfirmCancellation(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, entryId: string) {
  if (!entryId) {
    return new Response('Missing entryId', { status: 400 });
  }

  const { data: entry, error: entryError } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, entry_link_id, requested_run_count, draw_pro_entry_links(steer_me_user_id, events(name))')
    .eq('id', entryId)
    .maybeSingle();
  if (entryError) {
    console.error('[draw-pro-results-webhook] confirmCancellation entry lookup failed', entryId, entryError);
    return Response.json({ error: entryError.message }, { status: 500 });
  }
  if (!entry) {
    // Not an error - could be a retried call after the last run already
    // deleted the row. Draw Pro already logs-and-swallows non-2xx here.
    return Response.json({ found: false }, { status: 404 });
  }

  const link = Array.isArray(entry.draw_pro_entry_links) ? entry.draw_pro_entry_links[0] : entry.draw_pro_entry_links;
  const eventRecord = link ? (Array.isArray(link.events) ? link.events[0] : link.events) : null;
  const eventName: string = eventRecord?.name ?? 'your event';
  const steerMeUserId: string | undefined = link?.steer_me_user_id;

  const remainingRuns = (entry.requested_run_count ?? 1) - 1;

  if (remainingRuns > 0) {
    const { error: updateError } = await supabaseAdmin
      .from('draw_pro_entry_link_teams')
      .update({ requested_run_count: remainingRuns, cancellation_requested_at: null })
      .eq('id', entryId);
    if (updateError) {
      console.error('[draw-pro-results-webhook] confirmCancellation decrement failed', entryId, updateError);
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    if (steerMeUserId) {
      sendPushNotification(
        supabaseAdmin,
        steerMeUserId,
        'One run cancelled',
        `One run of your entry for ${eventName} was removed. ${remainingRuns} run${remainingRuns === 1 ? '' : 's'} ` +
          `still active - open My Entries if you'd like to cancel another.`
      ).catch((err) => console.error('[draw-pro-results-webhook] confirmCancellation push failed', err));
    }

    return Response.json({ found: true, deleted: false, remainingRuns });
  }

  const { error: deleteError } = await supabaseAdmin.from('draw_pro_entry_link_teams').delete().eq('id', entryId);
  if (deleteError) {
    console.error('[draw-pro-results-webhook] confirmCancellation delete failed', entryId, deleteError);
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  if (steerMeUserId) {
    sendPushNotification(
      supabaseAdmin,
      steerMeUserId,
      'Entry cancelled',
      `Your entry for ${eventName} has been cancelled and removed.`
    ).catch((err) => console.error('[draw-pro-results-webhook] confirmCancellation push failed', err));
  }

  return Response.json({ found: true, deleted: true });
}

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
