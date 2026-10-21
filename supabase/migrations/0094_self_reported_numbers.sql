-- Ropers without a Global card (Justin, 2026-10-22). A profile with no Global membership id is a
-- SELF-REPORTED number; one with an id is VERIFIED (as before). The label is derived, not typed: a
-- generated column nobody can write, so a client cannot call itself verified without an id.
-- Numbers still live in the same columns (the number system is universal), so cap and pairing math
-- (canPair) works unchanged.
--
-- Also here:
--  * self_assessment: the answers a no-card roper gave at sign-up (jsonb, written by the app).
--  * classification_changed_at: when a number last changed; self-reported numbers can move UP any time
--    but only DOWN after 90 days (stops sandbagging).
--  * Phone verification: when app_settings.require_phone_for_unverified is true, a self-reported profile
--    can only be saved if the account's phone is confirmed. OFF until the SMS provider (Twilio) is live.
--  * signup_events: a tiny funnel log (which step, what the roper answered) so the size of the no-card
--    group is measured, not guessed. Insert-only for the user; nobody can read it from the app.

alter table public.profiles
  add column if not exists number_source text
    generated always as (case when global_membership_id is null then 'self_reported' else 'verified' end) stored,
  add column if not exists self_assessment jsonb,
  add column if not exists classification_changed_at timestamptz;

comment on column public.profiles.number_source is
  'verified = has a Global membership id and card screenshot; self_reported = no card, number is the roper''s own claim. Derived, not writable.';

insert into public.app_settings (key, value)
values ('require_phone_for_unverified', 'false'::jsonb)
on conflict (key) do nothing;

-- Public view: add the label at the end (create or replace may only append columns).
create or replace view public.public_profiles
with (security_invoker = false) as
select
  id,
  full_name,
  "position",
  home_area,
  global_classification,
  avatar_url,
  is_minor,
  header_classification,
  heeler_classification,
  membership_expiration_date,
  number_source
from public.profiles
where not suspended
  and not hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;

-- Does this account have a confirmed phone? (auth.users is not readable by clients.)
create or replace function public.account_phone_confirmed(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select phone_confirmed_at is not null from auth.users where id = uid), false);
$$;
revoke all on function public.account_phone_confirmed(uuid) from public, anon, authenticated;

-- What the sign-up screen needs to know before it shows the phone step.
create or replace function public.get_signup_requirements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'phone_required_for_unverified',
    coalesce((select (value)::text = 'true' from public.app_settings where key = 'require_phone_for_unverified'), false)
  );
$$;
revoke all on function public.get_signup_requirements() from public, anon;
grant execute on function public.get_signup_requirements() to authenticated;

create or replace function public.guard_self_reported_profile()
returns trigger
language plpgsql
as $$
declare
  numbers_changed boolean;
  lowered boolean;
begin
  -- Only direct app/API requests are checked; scripts and admin tools are not.
  if current_user <> 'authenticated' then
    return new;
  end if;

  numbers_changed := tg_op = 'INSERT'
    or new.global_classification is distinct from old.global_classification
    or new.header_classification is distinct from old.header_classification
    or new.heeler_classification is distinct from old.heeler_classification;

  if new.global_membership_id is null then
    -- Self-reported: the phone must be confirmed once the requirement is switched on.
    if coalesce((select (value)::text = 'true' from public.app_settings where key = 'require_phone_for_unverified'), false)
       and not public.account_phone_confirmed(new.id) then
      raise exception 'Verify your phone number before saving a profile without a Global card' using errcode = 'P0001', hint = 'phone_not_verified';
    end if;

    -- Moving a self-reported number down is only allowed 90 days after the last change.
    if tg_op = 'UPDATE' and old.global_membership_id is null and numbers_changed then
      lowered := coalesce(new.global_classification < old.global_classification, false)
        or coalesce(new.header_classification < old.header_classification, false)
        or coalesce(new.heeler_classification < old.heeler_classification, false);
      if lowered and old.classification_changed_at is not null
         and old.classification_changed_at > now() - interval '90 days' then
        raise exception 'A self-reported number can be raised any time, but lowered only 90 days after your last change' using errcode = 'P0001', hint = 'lowering_too_soon';
      end if;
    end if;
  end if;

  if numbers_changed then
    new.classification_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_self_reported on public.profiles;
create trigger profiles_guard_self_reported
  before insert or update on public.profiles
  for each row execute function public.guard_self_reported_profile();

create table if not exists public.signup_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  step text not null check (char_length(step) <= 40),
  value text check (char_length(value) <= 60),
  created_at timestamptz not null default now()
);
alter table public.signup_events enable row level security;
create policy signup_events_insert_own on public.signup_events
  for insert to authenticated with check (user_id = auth.uid());
