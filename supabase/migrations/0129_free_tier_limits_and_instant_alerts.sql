-- Phase 2 of the roping-alerts plan plus the free-tier limits Justin approved on 2026-11-07
-- (DOCS/plan-a-roping-alerts-first-paid-feature-2026-11-07.md, sections 3 and 10).
--
-- 1. is_paying_member(uid): an active store, Stripe or comped subscription ONLY. has_active_subscription() stays exactly as it
--    is for the "3 free matches" rule (it is also true for anyone with fewer than 3 accepted matches, and for everyone while
--    the paywall is off), so it must NOT be used to gate instant alerts or the limits below.
-- 2. Free members: at most 3 partner requests open (pending or pending_guardian) at once, and 1 active need post at a time.
--    Server-side triggers, so a modified app cannot get round them. Paying members, comped users and test/demo/reviewer
--    profiles are exempt. Nothing is limited while paywall_enabled is false.
-- 3. A request can be withdrawn by its sender, and an unanswered request closes by itself after 7 days. Both DELETE the row
--    (no notice to anyone, never counted as a match) and leave a row in partner_request_closures so we can still measure how
--    many requests go unanswered.
-- 4. Plumbing for instant alerts: alert_sends (what was already sent to whom), alert_prefs.instant_since, and a 15-minute job.
--    The job does nothing until app_settings.instant_alerts_enabled is true.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Who counts as a paying member
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.is_paying_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.comped_users where user_id = uid)
      or coalesce((select entitlement_active from public.subscriptions where id = uid), false)
      or coalesce((select active from public.stripe_subscriptions where user_id = uid), false);
$$;

-- Do the free-tier limits apply to this person right now?
create or replace function public.free_tier_limits_apply(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::text = 'true' from public.app_settings where key = 'paywall_enabled'), false)
     and not public.is_paying_member(uid)
     and not coalesce((select is_demo from public.profiles where id = uid), false);
$$;

revoke all on function public.is_paying_member(uuid) from public, anon, authenticated;
revoke all on function public.free_tier_limits_apply(uuid) from public, anon, authenticated;

insert into public.app_settings (key, value) values
  ('free_open_requests', '3'::jsonb),
  ('free_need_posts', '1'::jsonb),
  ('request_expiry_days', '7'::jsonb),
  ('instant_alerts_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Limits on open requests and active need posts
-- ---------------------------------------------------------------------------------------------------------------------
-- A need post is "active" the way the Browse list counts it: a goat roping post, or one whose date has not passed
-- (central time, so a post for tonight stays active until midnight there).
create or replace function public.active_need_post_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.need_posts
  where athlete_id = uid
    and (is_goat_roping or event_date >= (now() at time zone 'America/Chicago')::date);
$$;

create or replace function public.open_request_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.partner_requests
  where requester_id = uid and status in ('pending', 'pending_guardian');
$$;

revoke all on function public.active_need_post_count(uuid) from public, anon, authenticated;
revoke all on function public.open_request_count(uuid) from public, anon, authenticated;

-- Security definer on purpose (it has to read app_settings, which no client can). Only calls made as a signed-in app user are
-- limited; the service role, the SQL editor and other security definer functions pass straight through.
create or replace function public.enforce_open_request_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if not public.free_tier_limits_apply(new.requester_id) then
    return new;
  end if;
  cap := coalesce((select (value)::text::integer from public.app_settings where key = 'free_open_requests'), 3);
  if public.open_request_count(new.requester_id) >= cap then
    raise exception 'You already have % requests waiting for an answer. Withdraw one, or subscribe to send more.', cap
      using errcode = 'P0001', hint = 'open_request_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists partner_requests_02_open_limit on public.partner_requests;
create trigger partner_requests_02_open_limit
  before insert on public.partner_requests
  for each row execute function public.enforce_open_request_limit();

create or replace function public.enforce_need_post_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if not public.free_tier_limits_apply(new.athlete_id) then
    return new;
  end if;
  cap := coalesce((select (value)::text::integer from public.app_settings where key = 'free_need_posts'), 1);
  if public.active_need_post_count(new.athlete_id) >= cap then
    raise exception 'Free members can have % need post up at a time. Take your current one down, or subscribe to post more.', cap
      using errcode = 'P0001', hint = 'need_post_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists need_posts_02_active_limit on public.need_posts;
create trigger need_posts_02_active_limit
  before insert on public.need_posts
  for each row execute function public.enforce_need_post_limit();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Withdraw and expire
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.partner_request_closures (
  id bigint generated always as identity primary key,
  closed_at timestamptz not null default now(),
  reason text not null check (reason in ('withdrawn', 'expired')),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid,
  request_created_at timestamptz not null
);
alter table public.partner_request_closures enable row level security;
-- deliberately no policies: service role only.

create or replace function public.withdraw_partner_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from public.partner_requests
  where id = request_id and requester_id = auth.uid() and status in ('pending', 'pending_guardian')
  returning requester_id, recipient_id, event_id, created_at into r;
  if not found then
    raise exception 'That request can no longer be withdrawn. It may already have been answered.' using errcode = 'P0001';
  end if;
  insert into public.partner_request_closures (reason, requester_id, recipient_id, event_id, request_created_at)
  values ('withdrawn', r.requester_id, r.recipient_id, r.event_id, r.created_at);
end;
$$;

revoke all on function public.withdraw_partner_request(uuid) from public, anon;
grant execute on function public.withdraw_partner_request(uuid) to authenticated;

-- Unanswered requests close after request_expiry_days. Test and demo profiles are left alone so reviewer and demo data
-- do not drain away. Silent: nobody is notified, and nothing counts as a match.
create or replace function public.expire_stale_partner_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  days integer := coalesce((select (value)::text::integer from public.app_settings where key = 'request_expiry_days'), 7);
  n integer;
begin
  with gone as (
    delete from public.partner_requests pr
    where pr.status in ('pending', 'pending_guardian')
      and pr.created_at < now() - make_interval(days => days)
      and not coalesce((select is_demo from public.profiles where id = pr.requester_id), false)
      and not coalesce((select is_demo from public.profiles where id = pr.recipient_id), false)
    returning pr.requester_id, pr.recipient_id, pr.event_id, pr.created_at
  ), logged as (
    insert into public.partner_request_closures (reason, requester_id, recipient_id, event_id, request_created_at)
    select 'expired', requester_id, recipient_id, event_id, created_at from gone
    returning 1
  )
  select count(*)::integer into n from logged;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_stale_partner_requests() from public, anon, authenticated;

-- 09:15 UTC is about 3 AM Central, well away from anyone answering a request.
select cron.schedule('expire-stale-partner-requests', '15 9 * * *', $$select public.expire_stale_partner_requests()$$);

-- ---------------------------------------------------------------------------------------------------------------------
-- What the app reads to show the limits (same function as 0099, plus the new numbers; existing keys are unchanged)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.get_free_tier_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'paywall_enabled', coalesce((select (value)::text = 'true' from public.app_settings where key = 'paywall_enabled'), false),
    'free_matches', coalesce((select (value)::text::integer from public.app_settings where key = 'free_matches'), 3),
    'matches_used', public.accepted_match_count(auth.uid()),
    'subscribed', public.is_paying_member(auth.uid()),
    'allowed', public.has_active_subscription(auth.uid()),
    'limits_apply', public.free_tier_limits_apply(auth.uid()),
    'open_requests_limit', coalesce((select (value)::text::integer from public.app_settings where key = 'free_open_requests'), 3),
    'open_requests_used', public.open_request_count(auth.uid()),
    'need_posts_limit', coalesce((select (value)::text::integer from public.app_settings where key = 'free_need_posts'), 1),
    'need_posts_used', public.active_need_post_count(auth.uid()),
    'request_expiry_days', coalesce((select (value)::text::integer from public.app_settings where key = 'request_expiry_days'), 7)
  );
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Instant alerts: bookkeeping and the 15-minute job
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.alert_prefs add column if not exists instant_since timestamptz;
comment on column public.alert_prefs.instant_since is
  'When the member last turned instant alerts on. Only ropings added after this moment are sent, so turning it on never floods the member with old ones.';

create or replace function public.set_alert_instant_since()
returns trigger
language plpgsql
as $$
begin
  if new.instant and (tg_op = 'INSERT' or not old.instant) then
    new.instant_since := now();
  elsif not new.instant then
    new.instant_since := null;
  end if;
  return new;
end;
$$;

drop trigger if exists alert_prefs_instant_since on public.alert_prefs;
create trigger alert_prefs_instant_since before insert or update on public.alert_prefs
  for each row execute function public.set_alert_instant_since();

create table if not exists public.alert_sends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  channel text not null default 'instant',
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id, channel)
);
alter table public.alert_sends enable row level security;
-- deliberately no policies: service role only.

create or replace function public.run_instant_roping_alerts(dry_run boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
  req_id bigint;
begin
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'db_webhook_secret';
  if webhook_secret is null then
    raise exception 'db_webhook_secret is not set in vault';
  end if;
  select net.http_post(
    url := 'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/instant-roping-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('dryRun', dry_run),
    timeout_milliseconds := 120000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function public.run_instant_roping_alerts(boolean) from public, anon, authenticated;

select cron.schedule('instant-roping-alerts', '*/15 * * * *', $$select public.run_instant_roping_alerts()$$);
