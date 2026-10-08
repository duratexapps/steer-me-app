-- Lets an admin script (service role) see whether the nightly sweep job ran and what the function answered,
-- without database console access. Not exposed to the app.
create or replace function public.nightly_sweep_status()
returns jsonb
language sql
security definer
set search_path = public, extensions, cron, net
as $$
  select jsonb_build_object(
    'job', (select jsonb_build_object('schedule', schedule, 'active', active) from cron.job where jobname = 'nightly-sweep'),
    'last_cron_runs', coalesce((select jsonb_agg(r) from (select start_time, status, return_message from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'nightly-sweep' order by start_time desc limit 3) r), '[]'::jsonb),
    'last_http_responses', coalesce((select jsonb_agg(h) from (select id, status_code, created, left(content, 600) as content, error_msg from net._http_response order by created desc limit 3) h), '[]'::jsonb)
  );
$$;
revoke all on function public.nightly_sweep_status() from public, anon, authenticated;
