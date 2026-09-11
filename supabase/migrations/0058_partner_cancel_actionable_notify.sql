-- Real gap flagged directly by the user: when a confirmed partner
-- cancels their entry, the OTHER half of the pairing already gets
-- notified (request_draw_pro_entry_submission_cancellation's "notify
-- only" branch, migration 0048) - but the push has never carried any
-- data payload, and nothing on the client has ever listened for a tap on
-- it. The notified partner had to independently think to open My
-- Entries and figure out their own next move. This migration adds the
-- data payload half; app/partner-cancelled.tsx (client) is the new
-- actionable screen it deep-links into.
--
-- Deliberately reuses everything that already exists rather than
-- building new matching/request machinery: app/(tabs)/browse.tsx
-- already supports an event-scoped "find a partner for this exact
-- event/division" mode (eventId/division/eventName params, wired since
-- Browse was split from Post a Need) - "Find a Replacement Partner" is
-- just a router.push into that existing screen with this cancellation's
-- own event_id/division. "Cancel My Entry Too" is just
-- request_draw_pro_entry_submission_cancellation() again, on the
-- notified partner's own entry id. Nothing new on the matching or
-- cancellation side - only the notification needed a data payload and a
-- landing screen needed to exist.

-- send_push_via_edge_function() (migration 0047) only ever sent
-- title/body - no way to carry structured data for a tap to act on.
-- p_data defaults to null so every EXISTING caller (ban-suspended
-- notices, plain informational pushes elsewhere) keeps working
-- unchanged; only call sites that want an actionable tap need to pass it.
create or replace function public.send_push_via_edge_function(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default null
)
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
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('userId', p_user_id, 'title', p_title, 'body', p_body, 'data', p_data)
  );
end;
$$;

-- REPLACES request_draw_pro_entry_submission_cancellation() from
-- migration 0048 - identical logic throughout, only the "notify only"
-- branch's push call changes (now carries a data payload the client can
-- act on). The auto-cancel branch is untouched - there's no decision
-- left for that person to make, so no actionable screen applies.
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

  if entry.entry_type <> 'preformed_team' then
    return;
  end if;

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
    -- NEW - carries what app/partner-cancelled.tsx needs to act: which
    -- entry is theirs to cancel if they choose to, and which event/
    -- division to search for a replacement in if they don't.
    -- partner_req.division may be null on an old pre-division request -
    -- the client screen just hides "Find a Replacement" in that case
    -- rather than erroring.
    perform public.send_push_via_edge_function(
      partner_user_id,
      'Your partner cancelled',
      format('Your %s entry needs a decision. Tap to keep your spot or back out too.', coalesce(event_name, 'event')),
      jsonb_build_object(
        'type', 'partner_cancelled',
        'eventId', link.event_id,
        'eventName', event_name,
        'entryId', partner_pending.id,
        'division', partner_req.division
      )
    );
  end if;
end;
$$;

grant execute on function public.request_draw_pro_entry_submission_cancellation(uuid) to authenticated;
