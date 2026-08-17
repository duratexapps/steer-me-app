-- Wires profiles insert -> the send-welcome-email Edge Function via pg_net,
-- same pattern as 0014_ban_suspended_webhook.sql. Fires on profiles INSERT
-- (not auth.users) because a completed profile - not just an auth.users row
-- - is the real "finished signing up" moment in this app (profiles are
-- inserted client-side right after account creation; see
-- app/(auth)/create-account.tsx). Reuses the same db_webhook_secret vault
-- value as the ban webhook - only the target function URL is new.

create or replace function public.notify_welcome_email()
returns trigger
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
  where name = 'send_welcome_email_function_url';

  if webhook_secret is null or function_url is null then
    -- Not configured yet (e.g. RESEND_API_KEY / vault secret not set up
    -- yet) - skip rather than error, so account creation itself always
    -- still succeeds even if the welcome email can't go out yet.
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'profiles',
      'record', jsonb_build_object('id', new.id, 'full_name', new.full_name)
    )
  );

  return new;
end;
$$;

create trigger profiles_notify_welcome_email
  after insert on public.profiles
  for each row
  execute function public.notify_welcome_email();
