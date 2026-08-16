-- Real ask, directly from the user: the welcome email should remind new
-- users about the referral program and give them their code right away,
-- not make them go find Refer a Friend on their own. Extends
-- notify_welcome_email() (migration 0051) to also pass referral_code -
-- safe to read here because profiles_set_referral_code (migration 0034)
-- is a BEFORE INSERT trigger and this one is AFTER INSERT, so by the time
-- this fires, new.referral_code already holds the generated code.
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
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'profiles',
      'record', jsonb_build_object('id', new.id, 'full_name', new.full_name, 'referral_code', new.referral_code)
    )
  );

  return new;
end;
$$;
