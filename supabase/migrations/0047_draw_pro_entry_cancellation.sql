-- Real gap flagged directly by the producer (ropingtools.com/Draw Pro):
-- pre-draw cancellation is a real-world thing (an entrant backs out before
-- the draw runs, gets a refund minus processing fees, and is removed from
-- the pool - see docs' refund policy). Today the ONLY way for that to
-- happen is the entrant contacting the producer outside the app entirely,
-- which is exactly the kind of off-platform detour Steer Me exists to
-- avoid. This migration adds the self-service request half of that flow;
-- the producer still has to execute the actual removal on Draw Pro's side
-- (see ropingtools-site's event-setup.jsw removeEntrant()) - this never
-- deletes a Draw Pro entrant record directly, since Steer Me has no
-- standing knowledge of that database at all, only its own token/event
-- identifiers (same idiom as every other cross-system call in this app).
--
-- Real complication this also has to handle: a PREFORMED TEAM entry pairs
-- two specific people. If one cancels, the pairing is broken regardless of
-- what the other person wants - they can't roll as a team missing their
-- half. So this also looks up an accepted Steer Me partner match for the
-- same event and, per the PARTNER's OWN profile preference, either
-- auto-requests their cancellation too or just notifies them to do it
-- themselves. Defaults to notify-only (not auto-cancel) - losing your
-- entry silently because your partner backed out is a worse failure mode
-- than one extra tap to confirm it yourself.

alter table public.profiles
  add column auto_cancel_team_entry_on_partner_cancel boolean not null default false;

comment on column public.profiles.auto_cancel_team_entry_on_partner_cancel is
  'If true, this user''s own Draw Pro entry is automatically cancelled '
  '(and they''re notified it happened) when their confirmed Steer Me '
  'partner for that event cancels theirs. If false (default), they''re '
  'just notified their partner cancelled and can request their own '
  'cancellation from My Entries. Set from the profile screen.';

alter table public.draw_pro_entry_links
  add column cancellation_requested_at timestamptz;

comment on column public.draw_pro_entry_links.cancellation_requested_at is
  'Set by request_draw_pro_entry_cancellation() when the Steer Me user '
  'asks to back out before the draw runs. Read by Draw Pro''s '
  'getCancellationRequests pull (draw-pro-results-webhook) so the '
  'producer can see who''s asked and execute the actual removal. Cleared '
  '(the whole row is deleted) once Draw Pro confirms the removal via '
  'confirmCancellation.';

-- NEW - real gap this migration exists to close: only the person who
-- actually taps "Enter the Draw" has ever gotten a draw_pro_entry_links
-- row, even when their confirmed partner is ALSO a genuine Steer Me user.
-- The partner's Draw Pro entrant record has never carried a
-- steerMeEntryLinkToken at all, meaning Draw Pro has had no way to know
-- "this entrant record belongs to Steer Me user X" for the partner half
-- of any preformed team - which is exactly why team-number/results
-- notifications have never reached a preformed partner either, not just
-- why this cancellation feature couldn't reach them. Fixed at the root:
-- create_entry_handoff() now also creates (or reuses) an entry link for
-- the partner, not just the caller, and returns both tokens so Draw Pro's
-- entrant-entry-form.js can store the partner's token on the partner's
-- OWN entrant record too.
alter table public.entry_handoffs
  add column me_entry_link_token text,
  add column partner_entry_link_token text;

comment on column public.entry_handoffs.me_entry_link_token is
  'The caller''s own draw_pro_entry_links token, created/reused at the '
  'same time as this handoff so entrant-entry-form.js has one consistent '
  'source (the handoff payload) for both the prefill data and the '
  'steerRef-equivalent token, instead of relying on the separate '
  '?steerRef= URL param also being present.';

comment on column public.entry_handoffs.partner_entry_link_token is
  'Same idea as me_entry_link_token, for the confirmed partner - null if '
  'there is no partner on this handoff. This is what makes the partner '
  'reachable for team/results/cancellation notifications at all, since '
  'they never separately tap "Enter the Draw" themselves.';

-- REPLACES create_entry_handoff() from migration 0036 - same signature
-- and prefill behavior, plus the entry-link creation for both parties
-- described above. Inlines the create_draw_pro_entry_link() upsert logic
-- (migration 0042) rather than calling that function directly, since it's
-- hard-scoped to auth.uid() and this needs to create a link for the
-- PARTNER, a different user, from a SECURITY DEFINER context.
create or replace function public.create_entry_handoff(
  p_event_id uuid,
  p_partner_request_id uuid default null,
  p_me_role text default null,
  p_partner_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  partner public.profiles;
  req public.partner_requests;
  partner_id uuid;
  handoff_id uuid;
  me_token text;
  partner_token text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me is null then
    raise exception 'Profile not found';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  if p_partner_request_id is not null then
    select * into req from public.partner_requests where id = p_partner_request_id;
    if req is null then
      raise exception 'Request not found';
    end if;
    if req.status <> 'accepted' then
      raise exception 'Request is not accepted';
    end if;
    if auth.uid() <> req.requester_id and auth.uid() <> req.recipient_id then
      raise exception 'Not authorized for this request';
    end if;
    if req.event_id is distinct from p_event_id then
      raise exception 'Request does not match this event';
    end if;
    if p_me_role is null or p_partner_role is null
       or p_me_role not in ('header', 'heeler') or p_partner_role not in ('header', 'heeler')
       or p_me_role = p_partner_role then
      raise exception 'Invalid role assignment';
    end if;

    partner_id := case when auth.uid() = req.requester_id then req.recipient_id else req.requester_id end;
    select * into partner from public.profiles where id = partner_id;
    if partner is null then
      raise exception 'Partner profile not found';
    end if;
  end if;

  insert into public.draw_pro_entry_links (steer_me_user_id, event_id, role)
  values (auth.uid(), p_event_id, p_me_role)
  on conflict (steer_me_user_id, event_id)
  do update set role = coalesce(excluded.role, draw_pro_entry_links.role)
  returning token into me_token;

  if partner.id is not null then
    insert into public.draw_pro_entry_links (steer_me_user_id, event_id, role)
    values (partner.id, p_event_id, p_partner_role)
    on conflict (steer_me_user_id, event_id)
    do update set role = coalesce(excluded.role, draw_pro_entry_links.role)
    returning token into partner_token;
  end if;

  insert into public.entry_handoffs (
    event_id, created_by,
    me_first_name, me_last_name, me_classification, me_global_membership_id, me_contact, me_role,
    partner_first_name, partner_last_name, partner_classification, partner_global_membership_id, partner_contact, partner_role,
    me_entry_link_token, partner_entry_link_token
  ) values (
    p_event_id, auth.uid(),
    split_part(me.full_name, ' ', 1),
    coalesce(nullif(substr(me.full_name, length(split_part(me.full_name, ' ', 1)) + 2), ''), ''),
    case
      when p_me_role is null then me.global_classification
      when p_me_role = 'header' then coalesce(me.global_classification, me.header_classification)
      else coalesce(me.global_classification, me.heeler_classification)
    end,
    me.global_membership_id,
    me.contact,
    p_me_role,
    case when partner.id is not null then split_part(partner.full_name, ' ', 1) else null end,
    case when partner.id is not null
      then coalesce(nullif(substr(partner.full_name, length(split_part(partner.full_name, ' ', 1)) + 2), ''), '')
      else null end,
    case
      when partner.id is null then null
      when p_partner_role = 'header' then coalesce(partner.global_classification, partner.header_classification)
      else coalesce(partner.global_classification, partner.heeler_classification)
    end,
    partner.global_membership_id,
    partner.contact,
    p_partner_role,
    me_token,
    partner_token
  )
  returning id into handoff_id;

  return handoff_id;
end;
$$;

grant execute on function public.create_entry_handoff(uuid, uuid, text, text) to authenticated;

-- pg_net already installed for notify_ban_suspended_user() (migration
-- 0014) - reused here rather than re-declaring the extension.
--
-- Generic (not cancellation-specific) so future features needing a
-- server-authorized push can reuse it rather than each growing their own
-- copy of the vault-secret-lookup + net.http_post boilerplate. Deliberately
-- NOT callable by the client directly (see send-push-notification Edge
-- Function's own comment) - only reachable via this shared-secret path
-- from a SECURITY DEFINER function that has ALREADY authorized who gets
-- notified and why, same reasoning as notify_ban_suspended_user().
create or replace function public.send_push_via_edge_function(p_user_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
  function_url text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'db_webhook_secret';

  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'send_push_notification_function_url';

  if webhook_secret is null or function_url is null then
    -- Same "skip rather than error" idiom as notify_ban_suspended_user() -
    -- a missing notification side effect should never fail the caller's
    -- own (already-successful) database change.
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('userId', p_user_id, 'title', p_title, 'body', p_body)
  );
end;
$$;

-- Known deterministically from the project ref - the function doesn't
-- need to exist yet at migration time, only by the time this RPC is
-- actually called. Idempotent (checks first) since migrations can be
-- re-applied to a fresh environment.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'send_push_notification_function_url'
  ) then
    perform vault.create_secret(
      'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/send-push-notification',
      'send_push_notification_function_url'
    );
  end if;
end $$;

-- The self-service request itself. Only ever moves an entry INTO
-- "cancellation requested" - the actual removal happens on Draw Pro's
-- side (producer-executed), which then calls confirmCancellation on the
-- draw-pro-results-webhook Edge Function to delete this row once done.
create or replace function public.request_draw_pro_entry_cancellation(p_entry_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.draw_pro_entry_links;
  event_name text;
  partner_req public.partner_requests;
  partner_user_id uuid;
  partner_link public.draw_pro_entry_links;
  partner_auto_cancel boolean;
begin
  select * into link from public.draw_pro_entry_links where id = p_entry_link_id;
  if link is null then
    raise exception 'Entry not found';
  end if;
  if link.steer_me_user_id <> auth.uid() then
    raise exception 'Not authorized for this entry';
  end if;

  if exists (select 1 from public.draw_pro_entry_link_teams where entry_link_id = link.id) then
    raise exception 'This entry already has a team assigned - the draw has run, so it can no longer be cancelled this way. Contact your producer.';
  end if;

  update public.draw_pro_entry_links
  set cancellation_requested_at = now()
  where id = link.id and cancellation_requested_at is null;

  select name into event_name from public.events where id = link.event_id;

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

  select auto_cancel_team_entry_on_partner_cancel into partner_auto_cancel
  from public.profiles where id = partner_user_id;

  if coalesce(partner_auto_cancel, false)
     and not exists (select 1 from public.draw_pro_entry_link_teams where entry_link_id = partner_link.id) then
    update public.draw_pro_entry_links
    set cancellation_requested_at = now()
    where id = partner_link.id and cancellation_requested_at is null;

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

grant execute on function public.request_draw_pro_entry_cancellation(uuid) to authenticated;
