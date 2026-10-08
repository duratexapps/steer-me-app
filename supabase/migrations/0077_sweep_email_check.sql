-- Diagnostic: ask the nightly-sweep function (which asks Resend) what happened to a message it sent.
create or replace function public.sweep_check_email(email_id text)
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
  select net.http_post(
    url := 'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/nightly-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('checkEmailId', email_id),
    timeout_milliseconds := 30000
  ) into req_id;
  return req_id;
end;
$$;
revoke all on function public.sweep_check_email(text) from public, anon, authenticated;
