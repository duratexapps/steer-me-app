-- Platform health numbers for the nightly sweep (2026-10-31). READ-ONLY: this function only counts things.
--
-- Why: the sweep already watches the queues Justin acts on (review queue, stuck sign-ups, reports). It did not watch
-- whether the platform itself was working, which is how the missing push tokens, the unanswered partner requests and
-- the sign-up drop-off were each found by accident. These counts feed checks 15 to 21 in the nightly email.
--
-- "Real" accounts exclude the test, demo and staff domains. "Opened the app" is the newest auth session activity,
-- which is refreshed while the app is open, so it is a floor, not an exact count. Service role only.

create or replace function public.platform_health()
returns jsonb
language sql
security definer
set search_path = public, auth, cron
as $$
  with real_users as (
    select u.* from auth.users u
    where u.email is not null
      and u.email !~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$'
  ),
  real_profiles as (select p.* from public.profiles p join real_users u on u.id = p.id),
  has_profile as (
    select id from public.profiles union select id from public.producer_profiles
  ),
  act as (
    select s.user_id, max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) last_active
    from auth.sessions s group by 1
  ),
  pend as (
    select r.* from public.partner_requests r
    join real_profiles a on a.id = r.requester_id
    join real_profiles b on b.id = r.recipient_id
    where r.status in ('pending', 'pending_guardian')
  )
  select jsonb_build_object(
    'accounts_total',            (select count(*) from real_users),
    'accounts_new_24h',          (select count(*) from real_users where created_at > now() - interval '24 hours'),
    'accounts_new_7d',           (select count(*) from real_users where created_at > now() - interval '7 days'),
    'new_7d_finished',           (select count(*) from real_users u where u.created_at > now() - interval '7 days' and u.id in (select id from has_profile)),
    'profiles_total',            (select count(*) from real_profiles),
    'profiles_with_token',       (select count(*) from real_profiles where expo_push_token is not null),
    'new_profiles_7d',           (select count(*) from real_profiles where created_at > now() - interval '7 days'),
    'new_profiles_7d_with_token',(select count(*) from real_profiles where created_at > now() - interval '7 days' and expo_push_token is not null),
    'active_24h',                (select count(*) from act join real_users u on u.id = act.user_id where act.last_active > now() - interval '24 hours'),
    'active_7d',                 (select count(*) from act join real_users u on u.id = act.user_id where act.last_active > now() - interval '7 days'),
    'confirm_window_total',      (select count(*) from real_users where created_at between now() - interval '14 days' and now() - interval '24 hours'),
    'confirm_window_unconfirmed',(select count(*) from real_users where created_at between now() - interval '14 days' and now() - interval '24 hours' and email_confirmed_at is null),
    'confirm_window_gmail_total',(select count(*) from real_users where created_at between now() - interval '14 days' and now() - interval '24 hours' and email ilike '%@gmail.com'),
    'confirm_window_gmail_unconfirmed', (select count(*) from real_users where created_at between now() - interval '14 days' and now() - interval '24 hours' and email ilike '%@gmail.com' and email_confirmed_at is null),
    'req_sent_7d',               (select count(*) from public.partner_requests r join real_profiles a on a.id = r.requester_id join real_profiles b on b.id = r.recipient_id where r.created_at > now() - interval '7 days'),
    'req_accepted_7d',           (select count(*) from public.partner_requests r join real_profiles a on a.id = r.requester_id join real_profiles b on b.id = r.recipient_id where r.status = 'accepted' and r.created_at > now() - interval '7 days'),
    'req_pending_total',         (select count(*) from pend),
    'req_pending_24h',           (select count(*) from pend where created_at < now() - interval '24 hours'),
    'req_pending_72h',           (select count(*) from pend where created_at < now() - interval '72 hours'),
    'req_oldest_pending_days',   (select coalesce(floor(extract(epoch from (now() - min(created_at))) / 86400), 0) from pend),
    'req_pending_recipient_no_token', (select count(*) from pend p join public.profiles b on b.id = p.recipient_id where b.expo_push_token is null),
    'phone_codes_7d',            (select count(*) from real_users where phone_change_sent_at > now() - interval '7 days'),
    'phone_confirmed_7d',        (select count(*) from real_users where phone_change_sent_at > now() - interval '7 days' and phone_confirmed_at is not null and phone_confirmed_at >= phone_change_sent_at),
    'events_upcoming_30d',       (select count(*) from public.events where status = 'published' and event_date between current_date and current_date + 30),
    'events_posted_7d',          (select count(*) from public.events where posted_by_admin and created_at > now() - interval '7 days'),
    'hours_since_admin_post',    (select coalesce(floor(extract(epoch from (now() - max(created_at))) / 3600), 9999) from public.events where posted_by_admin),
    'cron_failures_7d',          (select count(*) from cron.job_run_details where status <> 'succeeded' and start_time > now() - interval '7 days')
  );
$$;

revoke all on function public.platform_health() from public, anon, authenticated;
grant execute on function public.platform_health() to service_role;
