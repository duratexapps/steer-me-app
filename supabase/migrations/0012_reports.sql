-- Two separate report paths, per the Community Guidelines and Producer
-- Guidelines: event_reports (accuracy/fraud on a listing, faster review
-- priority) and user_reports (personal conduct, feeds the 3-strike system).
--
-- Strike enforcement, as confirmed with the user: reports queue for review
-- and only count once a human marks them 'confirmed' via Supabase Studio
-- (see supabase/RUNBOOK.md) - no admin app exists in v1. The one exception,
-- independent of the strike count, is a report alleging solicitation of a
-- minor: that immediately suspends the profile pending review per Community
-- Guidelines section 3, without waiting to be confirmed and without
-- scrubbing data yet (evidence may need to be preserved for a law
-- enforcement / NCMEC referral).
--
-- Both triggers below only flip public.profiles.suspended - they never call
-- the Auth admin API directly (plain SQL can't). A Database Webhook on
-- profiles UPDATE OF suspended (documented in the runbook) invokes the
-- ban-suspended-user Edge Function, which is what actually locks the login.

create table public.event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  offense text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  priority text not null default 'high',
  created_at timestamptz not null default now()
);

alter table public.event_reports enable row level security;

create policy "event_reports_select_own" on public.event_reports
  for select using (auth.uid() = reporter_id);

create policy "event_reports_insert_own" on public.event_reports
  for insert with check (auth.uid() = reporter_id);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  offense text not null,
  description text not null,
  content_ref text,
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint no_self_report check (target_user_id <> reporter_id)
);

alter table public.user_reports enable row level security;

create policy "user_reports_select_own" on public.user_reports
  for select using (auth.uid() = reporter_id);

create policy "user_reports_insert_own" on public.user_reports
  for insert with check (auth.uid() = reporter_id);

create or replace function public.handle_new_user_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.offense = 'Soliciting a minor' then
    update public.profiles
    set suspended = true,
        suspended_reason = 'Pending review: reported for soliciting a minor'
    where id = new.target_user_id;
  end if;
  return new;
end;
$$;

create trigger user_reports_after_insert
  after insert on public.user_reports
  for each row execute function public.handle_new_user_report();

-- On the 3rd confirmed report against the same user, scrub the sensitive
-- profile columns and suspend the profile. full_name/home_area/position stay
-- (harmless, and useful for any historical record other users' accepted
-- requests still reference) but everything identifying or contactable is
-- nulled.
create or replace function public.handle_report_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed_count integer;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    select count(*) into confirmed_count
    from public.user_reports
    where target_user_id = new.target_user_id and status = 'confirmed';

    if confirmed_count >= 3 then
      update public.profiles
      set suspended = true,
          suspended_reason = 'Suspended: 3rd confirmed report',
          scrubbed = true,
          full_name = 'Deleted user',
          contact = null,
          guardian_name = null,
          guardian_contact = null,
          global_membership_id = null,
          global_classification = null,
          verification_screenshot_path = null,
          avatar_url = null
      where id = new.target_user_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger user_reports_after_update
  after update on public.user_reports
  for each row execute function public.handle_report_confirmed();
