-- The reverse direction of entry_handoffs (migration 0036): that table
-- hands Steer Me data INTO Draw Pro's entry form once, short-lived and
-- single-use. This table is the durable counterpart - created the same
-- moment a user taps "Enter the Draw," but meant to live for the whole
-- event, so Draw Pro has something stable to attribute a team number and
-- (later, see migration 0043) round-by-round results back to once the
-- producer actually runs the draw.
--
-- One row per (user, event) - re-tapping "Enter the Draw" reuses the same
-- token rather than minting a new one every time, since Draw Pro's
-- entrant-entry-form.js only stores whatever token was live on the URL
-- at the moment of actual submission, and there is no reason for two
-- different tokens to legitimately exist for the same person at the same
-- event.
--
-- The token itself (not this row's own uuid `id`) is what goes in the
-- "Enter the Draw" URL as `&steerRef=<token>` - a second, independent
-- opaque identifier from the existing `handoff=<id>` param, so Draw Pro
-- can tell "short-lived prefill snapshot" and "durable results-
-- attribution link" apart. A random opaque token in a URL is not the
-- privacy anti-pattern entry_handoffs' own comment warns against (that
-- was about raw personal data - name/contact/classification - ending up
-- in browser history/logs; this token carries no meaning on its own
-- without a service-role lookup, same as the existing handoff id already
-- is).
create table public.draw_pro_entry_links (
  id uuid primary key default gen_random_uuid(),
  -- gen_random_uuid() rather than pgcrypto's gen_random_bytes() - this
  -- project's pgcrypto install isn't reliably on the migration
  -- connection's search_path (confirmed live: "function
  -- gen_random_bytes(integer) does not exist" without schema-qualifying
  -- it), whereas gen_random_uuid() is core Postgres and already the
  -- proven pattern for every other opaque id in this schema.
  token text not null default gen_random_uuid()::text,
  steer_me_user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  -- 'header' | 'heeler' | null - best-effort, set from whatever role
  -- context is known at "Enter the Draw" tap time (e.g. an accepted
  -- partner request's role assignment); Draw Pro's own entry form is
  -- still the source of truth if this disagrees with what the entrant
  -- actually selects there.
  role text check (role in ('header', 'heeler')),
  team_number int,
  created_at timestamptz not null default now(),

  unique (token),
  unique (steer_me_user_id, event_id)
);

comment on table public.draw_pro_entry_links is
  'Durable per-(user,event) link created when a Steer Me user taps "Enter '
  'the Draw," carrying an opaque token Draw Pro stores on the matching '
  'DrawProEntrants row (steerMeEntryLinkToken) and later uses to push a '
  'team_number back once a draw is finalized - see '
  'backend/steerMeResultsSync.jsw in ropingtools-site, and the '
  'draw-pro-results-webhook Edge Function on this side.';

-- Same access shape as entry_handoffs: no public insert/update policy at
-- all. Creation only via create_draw_pro_entry_link() below (SECURITY
-- DEFINER, scoped to auth.uid()). Writes from Draw Pro (team_number)
-- happen via the draw-pro-results-webhook Edge Function's service-role
-- key, which bypasses RLS entirely by design - same pattern already
-- established for public.events writes from steerMeSync.jsw.
alter table public.draw_pro_entry_links enable row level security;

create policy "draw_pro_entry_links_select_own" on public.draw_pro_entry_links
  for select using (auth.uid() = steer_me_user_id);

create or replace function public.create_draw_pro_entry_link(
  p_event_id uuid,
  p_role text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result_token text;
begin
  if p_role is not null and p_role not in ('header', 'heeler') then
    raise exception 'Invalid role';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  insert into public.draw_pro_entry_links (steer_me_user_id, event_id, role)
  values (auth.uid(), p_event_id, p_role)
  on conflict (steer_me_user_id, event_id)
  do update set role = coalesce(excluded.role, draw_pro_entry_links.role)
  returning token into result_token;

  return result_token;
end;
$$;

grant execute on function public.create_draw_pro_entry_link(uuid, text) to authenticated;
