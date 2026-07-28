-- NEW, added 2026-07-27 - "refer a friend," available everywhere via a
-- persistent header icon (ScreenHeader.tsx). Reward is granted through
-- RevenueCat's Promotional Entitlements API (real free time on the
-- actual subscription, not a separate in-house credit ledger that could
-- drift from what RevenueCat itself thinks is true) once the REFERRED
-- person's subscription first activates - see
-- supabase/functions/revenuecat-webhook/index.ts.
--
-- Deliberately a manually-typed code, not a tap-through deep link: this
-- app has no real public domain or App Store/Google Play listing yet
-- (see RUNBOOK.md's "Setting up real subscriptions" section - none of
-- that external setup exists as of this build), so a universal/app link
-- would silently fail for anyone who doesn't already have the app
-- installed. A plain code works regardless of platform or install
-- state today; upgrading to a real tap-through link is a reasonable
-- follow-up once there's an actual app-store presence to link to.
alter table public.profiles
  add column referral_code text unique,
  add column referred_by uuid references public.profiles(id),
  add column referral_reward_granted_at timestamptz;

comment on column public.profiles.referral_code is
  'Auto-generated at insert (see profiles_set_referral_code trigger) - '
  '7 characters, excludes ambiguous O/0/I/1. Shared manually by the user, '
  'typed in by whoever they refer at sign-up.';
comment on column public.profiles.referred_by is
  'Set once at sign-up if a valid referral code was entered - never '
  'changed after that. NULL for anyone who signed up without one.';
comment on column public.profiles.referral_reward_granted_at is
  'Set once, by the revenuecat-webhook function, the first time this '
  'referred person''s subscription actually activates - prevents '
  'granting the reward more than once for the same referral.';

-- 7 chars from a 32-symbol alphabet excluding visually-confusable
-- characters (0/O, 1/I) - 32^7 ≈ 34 billion combinations, collision
-- retry loop below handles the astronomically unlikely case anyway.
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  already_taken boolean;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.profiles where referral_code = code) into already_taken;
    exit when not already_taken;
  end loop;
  return code;
end;
$$;

create or replace function public.set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

create trigger profiles_set_referral_code
before insert on public.profiles
for each row execute function public.set_referral_code();

-- Producers referring producers isn't in scope here (no producer-side
-- reward mechanic requested) - this is athlete-to-athlete only, matching
-- how the feature was actually asked for.

-- Lets sign-up.tsx resolve a typed-in code to a profile id without
-- needing broad SELECT access to the profiles table (which stays
-- protected by RLS otherwise - referral_code isn't exposed on the
-- public_profiles view). security definer bypasses RLS just for this
-- one narrow lookup; returns null for an unknown/invalid code rather
-- than erroring, so the caller can show a plain "code not found" message.
create or replace function public.resolve_referral_code(code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where referral_code = upper(trim(code));
$$;

grant execute on function public.resolve_referral_code(text) to authenticated;

-- For the Referral screen's own stats display - "N friends joined, M
-- have subscribed" - without exposing the full list of who referred_by
-- points to whom (that's still only visible via service-role, e.g. from
-- the webhook or a support investigation).
create or replace function public.get_referral_stats()
returns table (referred_count bigint, rewarded_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where referred_by = auth.uid()),
    count(*) filter (where referred_by = auth.uid() and referral_reward_granted_at is not null)
  from public.profiles;
$$;

grant execute on function public.get_referral_stats() to authenticated;
