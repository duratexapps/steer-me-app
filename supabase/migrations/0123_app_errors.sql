-- In-house app error log (2026-10-31).
--
-- Found by the platform audit: the app had no crash or error reporting at all, so a screen that threw an error on someone's
-- phone was invisible unless they told us. The app now reports uncaught errors here (best effort, never blocks anything) and
-- the nightly check summarizes them. Signed-out visitors can report too, because sign-up is where errors cost the most.
-- Insert-only for the app; nobody can read it from the app. A trigger drops rows past a global hourly cap so the table
-- cannot be flooded. (Native crashes that kill the app before it can report are still only visible in App Store Connect and
-- Play Console crash reports.)

create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  platform text,
  app_version text,
  update_info text,
  context text,
  fatal boolean not null default false,
  message text not null check (char_length(message) <= 600),
  stack text check (char_length(stack) <= 3500),
  fingerprint text check (char_length(fingerprint) <= 120)
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

create policy app_errors_insert on public.app_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.app_errors to anon, authenticated;

create or replace function public.app_errors_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.app_errors where created_at > now() - interval '1 hour') >= 400 then
    return null; -- over the hourly cap: drop quietly
  end if;
  return new;
end;
$$;

drop trigger if exists app_errors_cap_trigger on public.app_errors;
create trigger app_errors_cap_trigger before insert on public.app_errors
  for each row execute function public.app_errors_cap();
