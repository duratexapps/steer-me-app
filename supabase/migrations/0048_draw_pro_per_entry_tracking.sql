-- Real gap flagged directly by the producer, discovered through live
-- testing: cancellation_requested_at lived on draw_pro_entry_links
-- (migration 0042/0047) - one row per (steer_me_user_id, event_id). But a
-- Steer Me user can submit MULTIPLE separate entries at the same event
-- across separate sessions (e.g. 2 draw-in runs on Monday, 2 more draw-in
-- runs on Wednesday) - all sharing that one link. Cancellation had no way
-- to say "cancel Wednesday's entry specifically," only "cancel something
-- for this person at this event," so the producer's Draw Pro side had no
-- reliable way to know which of a person's several entrant records to
-- actually remove.
--
-- draw_pro_entry_link_teams (migration 0045) already solves the identical
-- shaped problem for POST-draw results: one row per team a person lands
-- on, not one scalar per link. This migration extends that same table
-- backward to also represent a PRE-draw pending entry (team_number null
-- until the draw actually runs and assigns one) rather than inventing a
-- separate table - an entry and the team it becomes are the same real-
-- world thing at two different points in time.
alter table public.draw_pro_entry_link_teams
  alter column team_number drop not null;

alter table public.draw_pro_entry_link_teams
  add column requested_run_count int not null default 1,
  add column entry_type text not null default 'draw_in' check (entry_type in ('draw_in', 'preformed_team')),
  add column submitted_at timestamptz not null default now(),
  add column cancellation_requested_at timestamptz;

comment on column public.draw_pro_entry_link_teams.requested_run_count is
  'How many draw-in runs this ONE submission represents (a preformed_team '
  'entry is always 1) - matches Draw Pro DrawProEntrants.requestedEntryCount '
  'for the entrant record this row was registered from. Purely descriptive '
  '(shown in My Entries); has no effect on how many teams this can later '
  'expand into once the draw actually runs.';

comment on column public.draw_pro_entry_link_teams.entry_type is
  '''draw_in'' or ''preformed_team'' - which kind of entry this was at '
  'submission time, so My Entries can show "2 draw-in runs" vs "entered '
  'with partner Jane Doe" instead of a generic entry.';

comment on column public.draw_pro_entry_link_teams.cancellation_requested_at is
  'Set by request_draw_pro_entry_cancellation() (rewritten in this '
  'migration to target ONE specific entry, not the whole link) when the '
  'Steer Me user asks to back out before the draw runs. Read by Draw '
  'Pro''s getCancellationRequests pull so the producer can execute the '
  'removal for exactly this entry - moved here from '
  'draw_pro_entry_links.cancellation_requested_at (migration 0047), which '
  'could only ever mean "something for this person," not "this specific '
  'entry."';

comment on table public.draw_pro_entry_link_teams is
  'One row per entry a Steer Me user has made at an event - created the '
  'moment Draw Pro''s entry form is actually submitted (team_number '
  'null), later updated in place once the draw runs and assigns a real '
  'team_number. A submission requesting more than one draw-in run can '
  'still expand into several teams at draw time (each with a different '
  'partner) - in that case this original row becomes the first of those '
  'teams, and additional rows are inserted for the rest, all sharing '
  'entry_link_id. Pushed/updated by ropingtools-site backend/'
  'steerMeResultsSync.jsw, upserted by draw-pro-results-webhook.';

-- draw_pro_entry_links.cancellation_requested_at (migration 0047) is
-- superseded by the per-entry column above - every real cancellation
-- request from here forward is scoped to one entry, never the whole link.
alter table public.draw_pro_entry_links
  drop column cancellation_requested_at;

-- REPLACES request_draw_pro_entry_cancellation(uuid) from migration 0047.
-- Same signature name would be ambiguous (old callers passed a link id,
-- this needs an entry id) - new name makes the changed contract explicit
-- at every call site rather than silently accepting the wrong kind of id.
drop function if exists public.request_draw_pro_entry_cancellation(uuid);

create or replace function public.request_draw_pro_entry_submission_cancellation(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.draw_pro_entry_link_teams;
  link public.draw_pro_entry_links;
  event_name text;
  partner_req public.partner_requests;
  partner_user_id uuid;
  partner_link public.draw_pro_entry_links;
  partner_pending public.draw_pro_entry_link_teams;
  partner_auto_cancel boolean;
begin
  select * into entry from public.draw_pro_entry_link_teams where id = p_entry_id;
  if entry is null then
    raise exception 'Entry not found';
  end if;

  select * into link from public.draw_pro_entry_links where id = entry.entry_link_id;
  if link is null or link.steer_me_user_id <> auth.uid() then
    raise exception 'Not authorized for this entry';
  end if;

  if entry.team_number is not null then
    raise exception 'This entry already has a team assigned - the draw has run, so it can no longer be cancelled this way. Contact your producer.';
  end if;

  update public.draw_pro_entry_link_teams
  set cancellation_requested_at = now()
  where id = entry.id and cancellation_requested_at is null;

  select name into event_name from public.events where id = link.event_id;

  -- Only meaningful for a preformed_team entry - a draw-in-only entry has
  -- no partner to notify or cascade to.
  if entry.entry_type <> 'preformed_team' then
    return;
  end if;

  -- Most recently accepted match wins if more than one somehow exists for
  -- this event (e.g. an earlier partner backed out and a new one was
  -- confirmed) - not expected to be common, but not prevented by any
  -- constraint either.
  select * into partner_req
  from public.partner_requests
  where event_id = link.event_id
    and status = 'accepted'
    and (requester_id = auth.uid() or recipient_id = auth.uid())
  order by responded_at desc nulls last
  limit 1;

  if partner_req is null then
    return;
  end if;

  partner_user_id := case when partner_req.requester_id = auth.uid() then partner_req.recipient_id else partner_req.requester_id end;

  select * into partner_link
  from public.draw_pro_entry_links
  where steer_me_user_id = partner_user_id and event_id = link.event_id;

  if partner_link is null then
    return;
  end if;

  -- The partner's OWN still-pending preformed_team entry for this same
  -- event - there should be at most one (a preformed pairing is one
  -- submission per side), most recent wins if that assumption is ever
  -- wrong.
  select * into partner_pending
  from public.draw_pro_entry_link_teams
  where entry_link_id = partner_link.id
    and entry_type = 'preformed_team'
    and team_number is null
  order by submitted_at desc
  limit 1;

  if partner_pending is null then
    return;
  end if;

  select auto_cancel_team_entry_on_partner_cancel into partner_auto_cancel
  from public.profiles where id = partner_user_id;

  if coalesce(partner_auto_cancel, false) then
    update public.draw_pro_entry_link_teams
    set cancellation_requested_at = now()
    where id = partner_pending.id and cancellation_requested_at is null;

    perform public.send_push_via_edge_function(
      partner_user_id,
      'Entry cancelled',
      format('Your %s entry was automatically cancelled because your partner cancelled theirs.', coalesce(event_name, 'event'))
    );
  else
    perform public.send_push_via_edge_function(
      partner_user_id,
      'Your partner cancelled',
      format('Your partner cancelled their %s entry. Open My Entries if you''d like to cancel yours too.', coalesce(event_name, 'event'))
    );
  end if;
end;
$$;

grant execute on function public.request_draw_pro_entry_submission_cancellation(uuid) to authenticated;

-- NEW - called from Draw Pro's entrant-entry-form.js (via
-- draw-pro-results-webhook, service-role) the moment a real submission
-- succeeds, so this entry has an identity from the start rather than only
-- becoming visible once a team_number shows up. SECURITY DEFINER +
-- unqualified by auth.uid() since the caller is Draw Pro's backend, not
-- the Steer Me user's own session - same trust boundary as every other
-- webhook-driven write in this schema (service-role Edge Function calls
-- this, not the client app directly).
create or replace function public.register_draw_pro_entry_submission(
  p_token text,
  p_entry_type text,
  p_requested_run_count int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.draw_pro_entry_links;
  new_id uuid;
begin
  if p_entry_type not in ('draw_in', 'preformed_team') then
    raise exception 'Invalid entry_type';
  end if;

  select * into link from public.draw_pro_entry_links where token = p_token;
  if link is null then
    raise exception 'Entry link not found for token';
  end if;

  insert into public.draw_pro_entry_link_teams (entry_link_id, entry_type, requested_run_count)
  values (link.id, p_entry_type, greatest(1, coalesce(p_requested_run_count, 1)))
  returning id into new_id;

  return new_id;
end;
$$;

-- No "to authenticated" grant - this is only ever called via the
-- service-role client inside draw-pro-results-webhook, same access shape
-- as send_push_via_edge_function and every other webhook-only function in
-- this schema.
