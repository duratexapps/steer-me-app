-- NEW, 2026-10-11 - Steer Me half of the Draw Pro "entry code + pay QR"
-- feature (see DOCS/steer-me-draw-pro-entry-code-handoff.md). Draw Pro now
-- gives every entry submission a short entry code (e.g. K7M2) and a pay
-- link; registerSubmission carries both. Stored on the pending-entry row so
-- My Entries can show the code and a QR at the payment window.
--
-- Both columns are null for entries made before this change; nothing reads
-- them as required.
alter table public.draw_pro_entry_link_teams
  add column entry_code text,
  add column pay_url text;

comment on column public.draw_pro_entry_link_teams.entry_code is
  'Draw Pro entry code, 4-5 chars from 23456789ABCDEFGHJKMNPQRSTUVWXYZ. Shown to the owner in My Entries. Unique only within a Draw Pro event, so never used as a key here.';
comment on column public.draw_pro_entry_link_teams.pay_url is
  'SECRET: https://ropingtools.com/pay/<private token>. Opens this entry on the secretary''s payment desk for a signed-in Draw Pro producer/helper. Owner-only via the existing RLS select policy; keep out of logs and analytics.';

-- register_draw_pro_entry_submission gains two optional arguments. The old
-- 3-argument version is dropped first: leaving both would make a call that
-- passes only the original three arguments ambiguous.
--
-- Bad values are stored as null rather than rejected: a malformed code or
-- link must never block an entry (Draw Pro treats this whole call as
-- best-effort). pay_url is accepted only for Draw Pro's own pay path, since
-- the app renders it as a QR code.
drop function if exists public.register_draw_pro_entry_submission(text, text, int);

create function public.register_draw_pro_entry_submission(
  p_token text,
  p_entry_type text,
  p_requested_run_count int,
  p_entry_code text default null,
  p_pay_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.draw_pro_entry_links;
  new_id uuid;
  v_code text := null;
  v_pay text := null;
begin
  if p_entry_type not in ('draw_in', 'preformed_team') then
    raise exception 'Invalid entry_type';
  end if;

  select * into link from public.draw_pro_entry_links where token = p_token;
  if link is null then
    raise exception 'Entry link not found for token';
  end if;

  if p_entry_code is not null and upper(p_entry_code) ~ '^[2-9A-HJKMNP-Z]{4,5}$' then
    v_code := upper(p_entry_code);
  end if;
  if p_pay_url is not null and p_pay_url ~ '^https://(www\.)?ropingtools\.com/pay/[A-Za-z0-9_-]{10,200}$' then
    v_pay := p_pay_url;
  end if;

  insert into public.draw_pro_entry_link_teams (entry_link_id, entry_type, requested_run_count, entry_code, pay_url)
  values (link.id, p_entry_type, greatest(1, coalesce(p_requested_run_count, 1)), v_code, v_pay)
  returning id into new_id;

  return new_id;
end;
$$;

-- Webhook-only (service-role Edge Function). Postgres grants EXECUTE to
-- PUBLIC on new functions by default, so revoke explicitly: nothing in the
-- client app calls this.
revoke all on function public.register_draw_pro_entry_submission(text, text, int, text, text)
  from public, anon, authenticated;
