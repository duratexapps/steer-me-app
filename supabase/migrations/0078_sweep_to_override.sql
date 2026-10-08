-- Lets an admin send the sweep to a different address once (delivery diagnosis). Normal nightly runs pass no address.
drop function if exists public.run_nightly_sweep(boolean);
create or replace function public.run_nightly_sweep(dry_run boolean default false, to_addr text default null)
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
    body := jsonb_strip_nulls(jsonb_build_object('dryRun', dry_run, 'to', to_addr)),
    timeout_milliseconds := 60000
  ) into req_id;
  return req_id;
end;
$$;
revoke all on function public.run_nightly_sweep(boolean, text) from public, anon, authenticated;
