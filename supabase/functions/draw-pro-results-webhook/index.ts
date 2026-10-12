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

// Class identity from Draw Pro (migration 0086). Anything malformed becomes
// null so a bad value can never block a team from being recorded.
function cleanClassId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}
function cleanClassName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, 60);
  return t.length > 0 ? t : null;
}

type PushTeam = {
  team_number: number | null;
  total_teams: number | null;
  partner_name: string | null;
  partner_classification_number: number | null;
};

// The "your team(s)" notification. The class goes FIRST in the title (the
// lock screen cuts long titles at the end, which hid it), and the event name
// moves to the first line of the message.
function buildTeamsPush(eventName: string, className: string | null, teams: PushTeam[]) {
  const lines = teams.map((t) => {
    const partner =
      t.partner_name != null
        ? `${t.partner_name}${t.partner_classification_number != null ? ` (${t.partner_classification_number})` : ''}`
        : 'partner TBD';
    const teamLabel = t.total_teams != null ? `Team #${t.team_number} of ${t.total_teams}` : `Team #${t.team_number}`;
    return `${teamLabel} — ${partner}`;
  });
  const noun = teams.length > 1 ? 'Your teams' : 'Your team';
  return {
    title: className ? `${noun} (${className})` : noun,
    body: [eventName, ...lines].join('\n'),
  };
}

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
    | 'pushRoundStandings'
    // NEW, 2026-10-11 - Draw Pro reports an entry's status (left out of a
    // paid-only draw, or paid at the window). Best effort on their side.
    | 'entryStatus'
    // NEW, 2026-10-11 - one "your teams" push per roper per class, sent after
    // all of that roper's teams were recorded with deferPush.
    | 'notifyTeams'
    // NEW, 2026-10-12 - live progress for entered riders (migration 0089).
    | 'liveProgress';
  lookups?: { token: string; teamNumber: number; classId?: string | null }[];
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
  // NEW, 2026-10-11 - registerSubmission's entry code and secret pay link
  // (migration 0083). Both optional; older Draw Pro calls omit them.
  entryCode?: string | null;
  payUrl?: string | null;
  status?: string;
  // NEW, 2026-10-11 - migration 0086. Draw Pro numbers teams per class, so a
  // team is identified by (token, classId, teamNumber). Both optional: a call
  // without classId behaves as before (legacy).
  classId?: string | null;
  className?: string | null;
  // NEW, 2026-10-11 - a team-assignment call with deferPush records the team
  // but sends no push; Draw Pro follows with one notifyTeams call per roper
  // per class so the roper gets a single notification, not one per team.
  deferPush?: boolean;
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
  // NEW, 2026-10-12 - liveProgress (migration 0089). round/totalActiveTeams are shared with standings.
  totalRounds?: number | null;
  roundComplete?: boolean;
  classStatus?: string;
  lastRopedTeamNumber?: number | null;
  remainingOrder?: number[];
  // Fastest-first short go: final-round teams that can no longer place and will not run.
  skippedTeamNumbers?: number[];
  seq?: number;
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
    return handleRegisterSubmission(
      supabaseAdmin,
      body.token ?? '',
      body.entryType,
      body.requestedRunCount,
      body.entryCode,
      body.payUrl,
      body.classId,
      body.className
    );
  }

  if (body.action === 'liveProgress') {
    return handleLiveProgress(supabaseAdmin, body);
  }

  if (body.action === 'notifyTeams') {
    return handleNotifyTeams(supabaseAdmin, body.token ?? '', body.classId, body.className);
  }

  if (body.action === 'entryStatus') {
    return handleEntryStatus(supabaseAdmin, body.token ?? '', body.entryId ?? '', body.status ?? '');
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
    const classId = cleanClassId(body.classId);
    const className = cleanClassName(body.className);
    const teamFields = {
      team_number: body.teamNumber,
      total_teams: body.totalTeams ?? null,
      partner_name: body.partnerName ?? null,
      partner_classification_number: body.partnerClassificationNumber ?? null,
      partner_role: body.partnerRole ?? null,
      ...(classId ? { draw_pro_class_id: classId, draw_pro_class_name: className } : {}),
    };

    // REWRITTEN 2026-10-11 (migration 0086) - class-aware, and the "first team
    // claims the pending row" step is now ONE conditional update instead of a
    // read followed by a write, so two simultaneous calls for the same entry
    // cannot both claim it. Step 1: claim this entry's pending row (team_number
    // still null). Step 2, if it was already claimed (an additional team from
    // the same submission) or there is no entryId (legacy): find the row for
    // (link, class, team) and update it, else insert it. A concurrent insert
    // that loses the unique race is retried once as an update.
    let upsertedTeam: { id: string } | null = null;
    if (body.entryId) {
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('draw_pro_entry_link_teams')
        .update(teamFields)
        .eq('id', body.entryId)
        .eq('entry_link_id', link.id)
        .is('team_number', null)
        .select('id');
      if (claimError) {
        console.error('[draw-pro-results-webhook] team claim failed', body.token, claimError);
        return Response.json({ error: claimError.message }, { status: 500 });
      }
      if (claimed && claimed.length > 0) upsertedTeam = claimed[0];
    }

    if (!upsertedTeam) {
      const findExisting = async () => {
        let q = supabaseAdmin
          .from('draw_pro_entry_link_teams')
          .select('id')
          .eq('entry_link_id', link.id)
          .eq('team_number', body.teamNumber as number);
        q = classId ? q.eq('draw_pro_class_id', classId) : q.is('draw_pro_class_id', null);
        return q.limit(1);
      };
      const updateExisting = async (id: string) =>
        supabaseAdmin.from('draw_pro_entry_link_teams').update(teamFields).eq('id', id).select('id').single();

      const { data: found, error: findError } = await findExisting();
      if (findError) {
        console.error('[draw-pro-results-webhook] team lookup failed', body.token, findError);
        return Response.json({ error: findError.message }, { status: 500 });
      }
      if (found && found.length > 0) {
        const { data, error } = await updateExisting(found[0].id);
        if (error) {
          console.error('[draw-pro-results-webhook] team update failed', body.token, error);
          return Response.json({ error: error.message }, { status: 500 });
        }
        upsertedTeam = data;
      } else {
        // An additional team from the same submission shows the same entry code,
        // pay link, entry type and run count as its parent entry (2026-10-12: the
        // run count was left at the default of 1, so a two-run entry read
        // "2 draw-in runs" on the first team and "1" on the second).
        let inherited: {
          entry_code: string | null;
          pay_url: string | null;
          entry_type?: string;
          requested_run_count?: number;
        } = { entry_code: null, pay_url: null };
        if (body.entryId) {
          const { data: parent } = await supabaseAdmin
            .from('draw_pro_entry_link_teams')
            .select('entry_code, pay_url, entry_type, requested_run_count')
            .eq('id', body.entryId)
            .eq('entry_link_id', link.id)
            .maybeSingle();
          if (parent) inherited = parent;
        }
        const ins = await supabaseAdmin
          .from('draw_pro_entry_link_teams')
          .insert({ entry_link_id: link.id, ...teamFields, ...inherited })
          .select('id')
          .single();
        if (ins.error) {
          // Lost a race with a concurrent call for the same team: update instead.
          const { data: again } = await findExisting();
          if (again && again.length > 0) {
            const { data, error } = await updateExisting(again[0].id);
            if (error) {
              console.error('[draw-pro-results-webhook] team update after race failed', body.token, error);
              return Response.json({ error: error.message }, { status: 500 });
            }
            upsertedTeam = data;
          } else {
            console.error('[draw-pro-results-webhook] team insert failed', body.token, ins.error);
            return Response.json({ error: ins.error.message }, { status: 500 });
          }
        } else {
          upsertedTeam = ins.data;
        }
      }
    }
    if (!upsertedTeam) {
      return Response.json({ error: 'team not recorded' }, { status: 500 });
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

    // NEW, 2026-10-09 - set only when a team-assignment push was actually
    // attempted. Draw Pro reads `pushed === false` as "this entrant's push
    // failed, email them instead"; undefined (no teams to push) is ignored.
    let pushed: boolean | undefined;

    // deferPush: the team is recorded but no push goes out; Draw Pro follows
    // with one notifyTeams call per roper per class.
    if (body.deferPush) {
      return Response.json({ found: true, linkId: link.id, teamNumber: body.teamNumber, deferred: true });
    }

    // With a classId, list only THIS class's teams (each class is signed off
    // on its own); without one, the old behavior (every team on the link).
    let teamsQuery = supabaseAdmin
      .from('draw_pro_entry_link_teams')
      .select('team_number, total_teams, partner_name, partner_classification_number')
      .eq('entry_link_id', link.id)
      .not('team_number', 'is', null)
      .order('team_number', { ascending: true });
    if (classId) teamsQuery = teamsQuery.eq('draw_pro_class_id', classId);
    const { data: teams, error: teamsError } = await teamsQuery;

    if (teamsError) {
      console.error('[draw-pro-results-webhook] teams list failed', body.token, teamsError);
    } else if (teams && teams.length > 0) {
      const push = buildTeamsPush(eventName, className, teams);
      // Awaited (was fire-and-forget) so the reply can say whether the push
      // went out. One Expo call, so the added latency is small.
      try {
        const sent = await sendPushNotification(supabaseAdmin, link.steer_me_user_id, push.title, push.body);
        pushed = sent === 'skipped' ? undefined : sent;
      } catch (err) {
        console.error('[draw-pro-results-webhook] push send failed', err);
        pushed = false;
      }
    }

    return Response.json({ found: true, linkId: link.id, teamNumber: body.teamNumber, ...(pushed === undefined ? {} : { pushed }) });
  }

  // Round-result call - resolve which of this person's teams it belongs to.
  const resultClassId = cleanClassId(body.classId);
  let teamLookup = supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, team_number, total_teams, draw_pro_class_name')
    .eq('entry_link_id', link.id)
    .eq('team_number', body.teamNumber);
  if (resultClassId) teamLookup = teamLookup.eq('draw_pro_class_id', resultClassId);
  const { data: teamRows, error: teamLookupError } = await teamLookup.limit(1);
  const team = teamRows && teamRows.length > 0 ? teamRows[0] : null;
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

  const classSuffix = team.draw_pro_class_name ? ` (${team.draw_pro_class_name})` : '';
  const teamLabel =
    (team.total_teams != null ? ` — Team #${team.team_number} of ${team.total_teams}` : ` — Team #${team.team_number}`) + classSuffix;
  const notification = body.noTime
    ? { title: 'Eliminated', body: `You've been eliminated after Round ${body.round}${teamLabel}` }
    : {
        title: `Round ${body.round} result`,
        body: `${body.finalTime != null ? `${body.finalTime}s` : 'Result recorded'}${teamLabel} at ${eventName}`,
      };
  // Awaited for the same reason as the standings push above.
  let resultPushed: boolean | undefined = false;
  try {
    const sent = await sendPushNotification(supabaseAdmin, link.steer_me_user_id, notification.title, notification.body);
    resultPushed = sent === 'skipped' ? undefined : sent;
  } catch (err) {
    console.error('[draw-pro-results-webhook] push send failed', err);
  }

  return Response.json({
    found: true,
    linkId: link.id,
    round: body.round,
    teamNumber: body.teamNumber,
    ...(resultPushed === undefined ? {} : { pushed: resultPushed }),
  });
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

  const standingsClassId = cleanClassId(body.classId);
  let standingsTeamQuery = supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('id, team_number, total_teams, draw_pro_class_name, standing_round')
    .eq('entry_link_id', link.id)
    .eq('team_number', body.teamNumber);
  if (standingsClassId) standingsTeamQuery = standingsTeamQuery.eq('draw_pro_class_id', standingsClassId);
  const { data: standingsTeams } = await standingsTeamQuery.limit(1);
  const team = standingsTeams && standingsTeams.length > 0 ? standingsTeams[0] : null;
  const teamLabel =
    (team?.total_teams != null ? ` — Team #${body.teamNumber} of ${team.total_teams}` : ` — Team #${body.teamNumber}`) +
    (team?.draw_pro_class_name ? ` (${team.draw_pro_class_name})` : '');

  // Save the standing so My Entries can show it (migration 0087), even when the
  // roper has no push token. An older round never overwrites a newer one.
  if (team && (team.standing_round == null || team.standing_round <= body.round)) {
    const { error: standingError } = await supabaseAdmin
      .from('draw_pro_entry_link_teams')
      .update({
        standing_rank: body.rank,
        standing_of: body.totalActiveTeams ?? null,
        standing_round: body.round,
      })
      .eq('id', team.id);
    if (standingError) {
      console.error('[draw-pro-results-webhook] standing save failed', body.token, standingError);
    }
  }

  const rankText = ordinal(body.rank);
  const fieldText = body.totalActiveTeams != null ? ` of ${body.totalActiveTeams}` : '';
  // AWAITED (2026-10-11, was fire-and-forget): a serverless function can be shut
  // down once it has responded, which can drop an un-awaited send. The joint
  // test saw a round-2 standings push never reach the phone. Waiting also lets
  // the reply say whether Expo accepted it.
  let pushed: boolean | undefined = false;
  try {
    const sent = await sendPushNotification(
      supabaseAdmin,
      link.steer_me_user_id,
      `Round ${body.round} standings — ${rankText} place`,
      `You're sitting ${rankText}${fieldText} after Round ${body.round} at ${eventName}${teamLabel}.`
    );
    pushed = sent === 'skipped' ? undefined : sent;
  } catch (err) {
    console.error('[draw-pro-results-webhook] pushRoundStandings push failed', err);
  }

  return Response.json({
    found: true,
    linkId: link.id,
    teamNumber: body.teamNumber,
    rank: body.rank,
    ...(pushed === undefined ? {} : { pushed }),
  });
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
  lookups: { token: string; teamNumber: number; classId?: string | null }[]
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
    .select('id, entry_link_id, team_number, draw_pro_class_id')
    .in('entry_link_id', linkIds);
  if (teamsError) {
    console.error('[draw-pro-results-webhook] getExtraRunStatuses teams lookup failed', teamsError);
    return Response.json({ error: teamsError.message }, { status: 500 });
  }
  // Exact key (link|class|number) for class-aware lookups; a lookup without a
  // classId falls back to the first team with that number on the link (legacy).
  const teamIdByLinkClassNumber = new Map(
    (teams ?? []).map((t) => [`${t.entry_link_id}|${t.draw_pro_class_id ?? ''}|${t.team_number}`, t.id])
  );
  const teamIdByLinkAndNumber = new Map<string, string>();
  for (const t of teams ?? []) {
    const k = `${t.entry_link_id}|${t.team_number}`;
    if (!teamIdByLinkAndNumber.has(k)) teamIdByLinkAndNumber.set(k, t.id);
  }
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
    const lookupClass = cleanClassId(l.classId);
    const teamId =
      linkId == null
        ? undefined
        : lookupClass
          ? teamIdByLinkClassNumber.get(`${linkId}|${lookupClass}|${l.teamNumber}`)
          : teamIdByLinkAndNumber.get(`${linkId}|${l.teamNumber}`);
    const charge = teamId != null ? chargeByTeamId.get(teamId) : undefined;
    if (!charge) {
      return { token: l.token, teamNumber: l.teamNumber, ...(l.classId ? { classId: l.classId } : {}), found: false };
    }
    return {
      token: l.token,
      teamNumber: l.teamNumber,
      ...(l.classId ? { classId: l.classId } : {}),
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
  requestedRunCount: number | undefined,
  entryCode?: string | null,
  payUrl?: string | null,
  classId?: string | null,
  className?: string | null
) {
  if (!token || !entryType) {
    return new Response('Missing token or entryType', { status: 400 });
  }

  const { data: entryId, error } = await supabaseAdmin.rpc('register_draw_pro_entry_submission', {
    p_token: token,
    p_entry_type: entryType,
    p_requested_run_count: requestedRunCount ?? 1,
    // The RPC validates both and stores null for anything malformed. pay_url
    // is a secret, so it is deliberately never logged here.
    p_entry_code: entryCode ?? null,
    p_pay_url: payUrl ?? null,
    p_class_id: classId ?? null,
    p_class_name: className ?? null,
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

// NEW, 2026-10-12 - migration 0089. Draw Pro sends the state of a class's run
// order after every saved time or order change; Steer Me keeps one row per
// (event, class) and the My Entries ticker reads it. Only a strictly newer seq
// is applied, so a late or repeated call can never move the ticker backwards.
// Team numbers only, no names. Replies found:false (404) when the Draw Pro
// event is not linked to a Steer Me event or no Steer Me rider entered it.
async function handleLiveProgress(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  body: WebhookPayload
) {
  const classId = cleanClassId(body.classId);
  const intOrNull = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  const status = body.classStatus;
  const remaining = Array.isArray(body.remainingOrder) ? body.remainingOrder : [];
  const skipped = Array.isArray(body.skippedTeamNumbers) ? body.skippedTeamNumbers : [];
  if (
    !body.drawProEventId ||
    !classId ||
    intOrNull(body.round) == null ||
    typeof body.seq !== 'number' ||
    !Number.isFinite(body.seq) ||
    (status !== 'not_started' && status !== 'running' && status !== 'complete') ||
    remaining.length > 2000 ||
    !remaining.every((n) => Number.isInteger(n) && n > 0) ||
    skipped.length > 2000 ||
    !skipped.every((n) => Number.isInteger(n) && n > 0)
  ) {
    return new Response('Invalid liveProgress body', { status: 400 });
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('draw_pro_event_id', body.drawProEventId)
    .maybeSingle();
  if (eventError) {
    console.error('[draw-pro-results-webhook] liveProgress event lookup failed', eventError);
    return Response.json({ error: eventError.message }, { status: 500 });
  }
  if (!event) {
    return Response.json({ found: false }, { status: 404 });
  }

  const { count, error: linkError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id);
  if (linkError) {
    console.error('[draw-pro-results-webhook] liveProgress link count failed', linkError);
    return Response.json({ error: linkError.message }, { status: 500 });
  }
  if (!count) {
    return Response.json({ found: false }, { status: 404 });
  }

  const { data: applied, error: upsertError } = await supabaseAdmin.rpc('upsert_draw_pro_live_progress', {
    p_event_id: event.id,
    p_class_id: classId,
    p_class_name: cleanClassName(body.className),
    p_class_status: status,
    p_round: body.round as number,
    p_total_rounds: intOrNull(body.totalRounds),
    p_round_complete: !!body.roundComplete,
    p_last_roped: intOrNull(body.lastRopedTeamNumber),
    p_remaining: remaining,
    p_total_active: intOrNull(body.totalActiveTeams),
    p_seq: Math.trunc(body.seq),
    p_skipped: skipped,
  });
  if (upsertError) {
    console.error('[draw-pro-results-webhook] liveProgress upsert failed', upsertError);
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  // applied=false means a newer (or equal) seq was already stored; still a success.
  return Response.json({ found: true, applied: !!applied });
}

// NEW, 2026-10-11 - one "your teams" notification per roper per class. Draw Pro
// records each team with deferPush, then calls this once. Lists every team the
// roper holds in that class (all classes if no classId, the legacy shape) and
// replies with `pushed` exactly like a single team-assignment call, so Draw
// Pro's fallback email still fires for every record when the push fails.
async function handleNotifyTeams(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  token: string,
  classIdRaw?: string | null,
  classNameRaw?: string | null
) {
  if (!token) {
    return new Response('Missing token', { status: 400 });
  }
  const classId = cleanClassId(classIdRaw);

  const { data: link, error: linkError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id, steer_me_user_id, events(name)')
    .eq('token', token)
    .maybeSingle();
  if (linkError) {
    console.error('[draw-pro-results-webhook] notifyTeams link lookup failed', linkError);
    return Response.json({ error: linkError.message }, { status: 500 });
  }
  if (!link) {
    return Response.json({ found: false }, { status: 404 });
  }
  const eventRecord = Array.isArray(link.events) ? link.events[0] : link.events;
  const eventName: string = eventRecord?.name ?? 'your event';

  let q = supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .select('team_number, total_teams, partner_name, partner_classification_number, draw_pro_class_name')
    .eq('entry_link_id', link.id)
    .not('team_number', 'is', null)
    .order('team_number', { ascending: true });
  if (classId) q = q.eq('draw_pro_class_id', classId);
  const { data: teams, error: teamsError } = await q;
  if (teamsError) {
    console.error('[draw-pro-results-webhook] notifyTeams teams lookup failed', teamsError);
    return Response.json({ error: teamsError.message }, { status: 500 });
  }
  if (!teams || teams.length === 0) {
    // Nothing recorded to announce; the team calls themselves report failures.
    return Response.json({ found: true, teams: 0 });
  }

  const className = cleanClassName(classNameRaw) ?? teams[0].draw_pro_class_name ?? null;
  const push = buildTeamsPush(eventName, className, teams);
  let pushed: boolean | undefined;
  try {
    const sent = await sendPushNotification(supabaseAdmin, link.steer_me_user_id, push.title, push.body);
    // 'skipped' = the rider chose email only or neither: not a failure, so no pushed field.
    pushed = sent === 'skipped' ? undefined : sent;
  } catch (err) {
    console.error('[draw-pro-results-webhook] notifyTeams push failed', err);
    pushed = false;
  }
  return Response.json({ found: true, teams: teams.length, ...(pushed === undefined ? {} : { pushed }) });
}

// NEW, 2026-10-11 - migration 0085. Draw Pro reports 'left_out_unpaid' (the
// class is paid-only and this entry was unpaid at the draw) or 'paid' (marked
// paid at the window). The entry must belong to the link the token names, so a
// mismatched pair changes nothing. No push is sent: this only feeds the
// My Entries card, and a left-out entrant already gets no team notification.
async function handleEntryStatus(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  token: string,
  entryId: string,
  status: string
) {
  if (!token || !entryId) {
    return new Response('Missing token or entryId', { status: 400 });
  }
  // 'unpaid' is not stored: it clears the status (an entry marked paid by
  // mistake and then reverted), so the card stops saying Paid.
  if (status !== 'left_out_unpaid' && status !== 'paid' && status !== 'unpaid') {
    return new Response('Invalid status', { status: 400 });
  }

  const { data: link, error: linkError } = await supabaseAdmin
    .from('draw_pro_entry_links')
    .select('id')
    .eq('token', token)
    .maybeSingle();
  if (linkError) {
    console.error('[draw-pro-results-webhook] entryStatus link lookup failed', linkError);
    return Response.json({ error: linkError.message }, { status: 500 });
  }
  if (!link) {
    return Response.json({ found: false }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('draw_pro_entry_link_teams')
    .update({ draw_pro_status: status === 'unpaid' ? null : status })
    .eq('id', entryId)
    .eq('entry_link_id', link.id)
    .select('id');
  if (updateError) {
    console.error('[draw-pro-results-webhook] entryStatus update failed', entryId, updateError);
    return Response.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    // The entry may already be gone (cancelled), same as confirmCancellation.
    return Response.json({ found: false }, { status: 404 });
  }

  return Response.json({ found: true, entryId, status });
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

// Returns true only when Expo accepted the message for a real push token.
// False covers no token, a lookup error, an HTTP failure, or an Expo ticket
// error (e.g. DeviceNotRegistered). Existing fire-and-forget callers ignore
// the result, so this does not change their behaviour.
async function sendPushNotification(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  steerMeUserId: string,
  title: string,
  body: string
): Promise<boolean | 'skipped'> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('expo_push_token, draw_pro_notice_pref')
    .eq('id', steerMeUserId)
    .maybeSingle();

  // NEW, 2026-10-12 (migration 0090): a rider who chose email only, or neither,
  // gets no push even if a stale token is still on file. 'skipped' is not a
  // failure: Draw Pro must not read it as "push failed, send a backup email".
  if (profile?.draw_pro_notice_pref === 'email' || profile?.draw_pro_notice_pref === 'none') return 'skipped';

  if (error || !profile?.expo_push_token) return false;

  const res = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: profile.expo_push_token, title, body }),
  });
  if (!res.ok) {
    console.error('[draw-pro-results-webhook] Expo push API responded', res.status, await res.text());
    return false;
  }
  try {
    const json = await res.json();
    const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
    if (ticket?.status === 'error') {
      console.error('[draw-pro-results-webhook] Expo push ticket error', ticket);
      return false;
    }
  } catch {
    // An unreadable but 2xx body: Expo accepted the request, so count it as sent.
  }
  return true;
}
