-- Tell people when a partner request arrives or is accepted (2026-10-31).
--
-- Found by the platform audit: nothing notified a roper when someone sent them a request or accepted theirs. A request sat
-- unseen until the recipient happened to open My Requests. Now a database trigger calls the notify-partner-request Edge
-- Function (same vault-secret + pg_net pattern as the welcome email), which sends a push if the person has a token and an
-- email unless they turned request emails off, and writes one row to notification_log so a failure is visible in the
-- nightly check instead of silent. The trigger never blocks a request: if queuing the notice fails, the request still saves.

alter table public.profiles
  add column if not exists email_request_notices boolean not null default true;
comment on column public.profiles.email_request_notices is
  'When true (default), Steer Me emails this person when a partner request arrives or is accepted. Push is separate (push_opted_out).';

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,                 -- received | accepted
  request_id uuid,
  user_id uuid,
  push_status text,                   -- sent | failed | no_token | opted_out | skipped
  email_status text,                  -- sent | failed | off | skipped
  detail text
);
alter table public.notification_log enable row level security;
-- deliberately no policies: service role only.

create or replace function public.notify_partner_request_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
  k text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    k := 'received';
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    k := 'accepted';
  else
    return new;
  end if;

  begin
    select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'db_webhook_secret';
    if webhook_secret is not null then
      perform net.http_post(
        url := 'https://ryjjwtsoeqyaiveslrat.supabase.co/functions/v1/notify-partner-request',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
        body := jsonb_build_object('kind', k, 'requestId', new.id),
        timeout_milliseconds := 20000
      );
    end if;
  exception when others then
    null; -- never block a partner request because the notice could not be queued
  end;
  return new;
end;
$$;

drop trigger if exists partner_requests_notify on public.partner_requests;
create trigger partner_requests_notify
  after insert or update of status on public.partner_requests
  for each row execute function public.notify_partner_request_event();
