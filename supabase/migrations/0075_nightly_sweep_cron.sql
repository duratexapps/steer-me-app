-- Nightly bottleneck sweep that runs on Supabase's own servers (pg_cron), so it doesn't depend on
-- anyone's computer. pg_cron -> run_nightly_sweep() -> pg_net POST -> nightly-sweep Edge Function ->
-- Resend email to ropingtools@duratex-ie.com, every night including "all clear" (a missing email is the alarm).
-- Same vault secret / pg_net pattern as 0014 and 0051.
--
-- SCHEDULE: pg_cron runs in UTC. 23:00 UTC = 6 PM Central during daylight time (until Nov 1, 2026) and
-- 5 PM Central during standard time. Re-schedule once if the exact hour matters:
--   select cron.alter_job((select jobid from cron.job where jobname = 'nightly-sweep'), schedule := '0 0 * * *');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- People Justin has already emailed about finishing sign-up; replaces tools/triage/nudged-signups.txt for the
-- server-side sweep. Service role only.
create table if not exists public.nudged_signups (
  email text primary key,
  nudged_on date not null default current_date
);
alter table public.nudged_signups enable row level security;

create or replace function public.run_nightly_sweep(dry_run boolean default false)
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
    url := 'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/nightly-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('dryRun', dry_run),
    timeout_milliseconds := 60000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function public.run_nightly_sweep(boolean) from public, anon, authenticated;

select cron.schedule('nightly-sweep', '0 23 * * *', $$select public.run_nightly_sweep()$$);
