-- Wires profiles.suspended -> the ban-suspended-user Edge Function directly
-- via pg_net, rather than requiring a manual Database Webhook click-through
-- in Studio. The shared secret is never embedded in this file - it's read
-- at call time from Supabase Vault (already installed on every Supabase
-- project), which is set once per-project via:
--   select vault.create_secret('<value>', 'db_webhook_secret');
-- (matching the DB_WEBHOOK_SECRET value given to `supabase secrets set` for
-- the Edge Function itself - see supabase/RUNBOOK.md).

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_ban_suspended_user()
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
  where name = 'ban_suspended_user_function_url';

  if webhook_secret is null or function_url is null then
    -- Not configured yet (e.g. a fresh project before RUNBOOK.md's vault
    -- setup step) - skip rather than error, so profile suspension itself
    -- always still succeeds even if the login-ban side effect is pending.
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'profiles',
      'record', jsonb_build_object('id', new.id, 'suspended', new.suspended)
    )
  );

  return new;
end;
$$;

create trigger profiles_notify_ban_suspended
  after update of suspended on public.profiles
  for each row
  when (new.suspended is distinct from old.suspended and new.suspended = true)
  execute function public.notify_ban_suspended_user();
