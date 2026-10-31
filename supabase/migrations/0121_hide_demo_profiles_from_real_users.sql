-- Demo, test and staff profiles are hidden from real ropers (2026-10-31).
--
-- Found by the platform audit: 36 test/demo/staff profiles were visible in Browse next to 14 real ones, 3 of the 6 partner
-- posts and 25 of the 34 event attendance rows were fake, and two real ropers had sent partner requests to fake profiles
-- that could never answer. supabase/DEMO_DATA.md said to delete the demo data before launch; it never was.
--
-- Fix: profiles.is_demo marks them. A flagged profile (and its posts, attendance and ratings) is visible only to other
-- flagged profiles, so the Apple/Google reviewer accounts and staff still see a populated app, and real ropers see only
-- real people. Users cannot set the flag themselves, and any new profile whose login email is a test/demo/staff address
-- is flagged automatically. Nothing is deleted.

alter table public.profiles add column if not exists is_demo boolean not null default false;
comment on column public.profiles.is_demo is
  'Test, demo or staff profile. Visible only to other is_demo profiles (reviewers, staff). Set by the database, never by users.';

update public.profiles p set is_demo = true
from auth.users u
where u.id = p.id
  and (u.email ~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$' or lower(u.email) = 'applereview@ropingtools.com');

create or replace function public.viewer_sees_demo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.visible_to_viewer(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select is_demo from public.profiles where id = target), false) or public.viewer_sees_demo();
$$;

grant execute on function public.viewer_sees_demo() to authenticated, anon;
grant execute on function public.visible_to_viewer(uuid) to authenticated, anon;

-- Users may not set or change the flag (same guard as the other protected columns).
create or replace function public.guard_profile_protected_columns()
returns trigger language plpgsql as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin or new.suspended or new.scrubbed or new.hidden_from_matching or new.is_demo
       or new.suspended_reason is not null
       or new.referral_reward_granted_at is not null
       or new.fix_note is not null then
      raise exception 'Not allowed to set protected profile fields' using errcode = '42501';
    end if;
  else
    if new.is_admin is distinct from old.is_admin
       or new.suspended is distinct from old.suspended
       or new.scrubbed is distinct from old.scrubbed
       or new.hidden_from_matching is distinct from old.hidden_from_matching
       or new.is_demo is distinct from old.is_demo
       or new.suspended_reason is distinct from old.suspended_reason
       or new.referral_reward_granted_at is distinct from old.referral_reward_granted_at
       -- a user may clear their fix note, never write one
       or (new.fix_note is distinct from old.fix_note and new.fix_note is not null) then
      raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Any new profile created under a test/demo/staff login email is flagged automatically, so future test accounts
-- cannot leak into real ropers' Browse. Named so it runs after the guard above.
create or replace function public.auto_flag_demo_profile()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (
    select 1 from auth.users u
    where u.id = new.id
      and (u.email ~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$' or lower(u.email) = 'applereview@ropingtools.com')
  ) then
    new.is_demo := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_zz_auto_flag_demo on public.profiles;
create trigger profiles_zz_auto_flag_demo
  before insert on public.profiles
  for each row execute function public.auto_flag_demo_profile();

-- People lists
create or replace view public.public_profiles
with (security_invoker = false) as
select
  id, full_name, "position", home_area, global_classification, avatar_url, is_minor,
  header_classification, heeler_classification, membership_expiration_date, number_source
from public.profiles
where not suspended
  and not hidden_from_matching
  and (not is_demo or public.viewer_sees_demo())
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

create or replace view public.public_finale_flags
with (security_invoker = false) as
select f.user_id, f.finale_year, f.qualified_classes, f.buy_in
from public.finale_flags f
join public.profiles p on p.id = f.user_id
where now() < make_date(f.finale_year::int, 12, 15)
  and p.global_membership_id is not null
  and not p.suspended
  and not p.hidden_from_matching
  and (not p.is_demo or public.viewer_sees_demo())
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), f.user_id));

-- Event attendance, ratings and partner posts
drop policy if exists event_attendance_select_all on public.event_attendance;
create policy event_attendance_select_all on public.event_attendance
  for select using (auth.role() = 'authenticated' and public.visible_to_viewer(athlete_id));

drop policy if exists event_ratings_select_all on public.event_ratings;
create policy event_ratings_select_all on public.event_ratings
  for select using (auth.role() = 'authenticated' and public.visible_to_viewer(athlete_id));

drop policy if exists need_posts_select_visible on public.need_posts;
create policy need_posts_select_visible on public.need_posts
  for select using (
    auth.role() = 'authenticated'
    and public.visible_to_viewer(athlete_id)
    and (
      visibility = 'everyone'
      or (visibility = 'favorites' and public.is_favorited_by(athlete_id, auth.uid()))
      or (visibility = 'selected' and public.is_selected_for_post(id, auth.uid()))
    )
  );

-- Rating averages (these views ignore row security, so they filter on their own)
create or replace view public.event_rating_summary as
select event_id,
  case when count(*) >= 3 then round(avg(stars), 1) else null::numeric end as avg_stars,
  count(*) as rating_count
from public.event_ratings
where public.visible_to_viewer(athlete_id)
group by event_id;

create or replace view public.producer_rating_summary as
select e.producer_identity_id,
  case when count(r.*) >= 3 then round(avg(r.stars), 1) else null::numeric end as avg_stars,
  count(r.*) as rating_count
from public.event_ratings r
join public.events e on e.id = r.event_id
where e.producer_identity_id is not null
  and public.visible_to_viewer(r.athlete_id)
group by e.producer_identity_id;

-- Health numbers now report the unflagged test accounts (should be 0) and how many are hidden
create or replace function public.platform_health()
returns jsonb
language sql
security definer
set search_path = public, auth, cron
as $$
  with real_users as (
    select u.* from auth.users u
    where u.email is not null
      and u.email !~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com|^applereview@ropingtools\.com)$'
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
    'fake_profiles_unflagged',   (select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email ~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com|^applereview@ropingtools\.com)$' and not p.is_demo),
    'demo_profiles_flagged',     (select count(*) from public.profiles where is_demo),
    'real_profiles_visible',     (select count(*) from real_profiles where not hidden_from_matching and not suspended and not is_demo),
    'req_real_to_fake_pending',  (select count(*) from public.partner_requests r join real_profiles a on a.id = r.requester_id join auth.users ub on ub.id = r.recipient_id where r.status in ('pending', 'pending_guardian') and ub.email ~* '(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com|^applereview@ropingtools\.com)$'),
    'cron_failures_7d',          (select count(*) from cron.job_run_details where status <> 'succeeded' and start_time > now() - interval '7 days')
  );
$$;

revoke all on function public.platform_health() from public, anon, authenticated;
grant execute on function public.platform_health() to service_role;
