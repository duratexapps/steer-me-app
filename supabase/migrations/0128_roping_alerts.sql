-- Roping alerts, phase 1 (Justin, 2026-11-07): a free weekly list of ropings near each member, emailed Mondays at 7 AM Central.
-- Plan: DOCS/plan-a-roping-alerts-first-paid-feature-2026-11-07.md. Instant alerts for paying members are phase 2 and are NOT
-- built here; the `instant` column only stores the member's wish so phase 2 needs no migration for it.

create table if not exists public.alert_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weekly boolean not null default true,
  instant boolean not null default false,
  -- null = any distance. Same choices as the Events screen's distance pills.
  radius_miles integer default 250 check (radius_miles is null or radius_miles in (100, 250, 500)),
  include_jackpots boolean not null default true,
  include_clinics boolean not null default true,
  include_practices boolean not null default true,
  -- Optional class range for jackpots, for example 8.5 to 10.5. Both null = any class.
  class_min numeric(3,1),
  class_max numeric(3,1),
  -- Put in every email's unsubscribe link, so one tap turns the list off with no sign-in.
  unsubscribe_token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  constraint alert_prefs_class_range check (class_min is null or class_max is null or class_min <= class_max),
  constraint alert_prefs_class_bounds check ((class_min is null or class_min between 0 and 30) and (class_max is null or class_max between 0 and 30))
);

comment on table public.alert_prefs is
  'Per-member roping alert settings. Owner-only. A member with no row gets the defaults (weekly list on, 250 miles, all types) when the weekly job first runs.';

alter table public.alert_prefs enable row level security;

create policy "alert_prefs_select_own" on public.alert_prefs for select using (auth.uid() = user_id);
create policy "alert_prefs_insert_own" on public.alert_prefs for insert with check (auth.uid() = user_id);
create policy "alert_prefs_update_own" on public.alert_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alert_prefs_delete_own" on public.alert_prefs for delete using (auth.uid() = user_id);

-- A member must not be able to rewrite their own unsubscribe token (it would break links already emailed).
create or replace function public.guard_alert_prefs_token()
returns trigger language plpgsql as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'UPDATE' and new.unsubscribe_token is distinct from old.unsubscribe_token then
    raise exception 'Not allowed to change this field' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists alert_prefs_guard_token on public.alert_prefs;
create trigger alert_prefs_guard_token before update on public.alert_prefs
  for each row execute function public.guard_alert_prefs_token();

drop trigger if exists alert_prefs_set_updated_at on public.alert_prefs;
create trigger alert_prefs_set_updated_at before update on public.alert_prefs
  for each row execute function public.set_updated_at();

-- Switches. Bulk sending stays OFF until Justin turns it on AND a mailing address is set (bulk email must carry one).
insert into public.app_settings (key, value) values
  ('weekly_alerts_enabled', 'false'::jsonb),
  ('alerts_mailing_address', '""'::jsonb)
on conflict (key) do nothing;

-- Cron -> pg_net -> weekly-roping-list Edge Function, same vault-secret pattern as the nightly sweep (0075).
-- pg_cron runs in UTC, so the job is scheduled for 12:00 and 13:00 UTC on Mondays; the function sends only when it is
-- 7 AM in America/Chicago, so the right one of the two fires in both daylight and standard time.
create or replace function public.run_weekly_roping_list(dry_run boolean default false)
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
    url := 'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/weekly-roping-list',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('dryRun', dry_run),
    timeout_milliseconds := 120000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function public.run_weekly_roping_list(boolean) from public, anon, authenticated;

select cron.schedule('weekly-roping-list', '0 12,13 * * 1', $$select public.run_weekly_roping_list()$$);
