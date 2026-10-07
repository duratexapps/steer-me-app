-- Free tier: "first 3 matches free, then subscribe". A MATCH = a partner
-- request with status 'accepted' (the same moment contact info and the card
-- screenshot unlock). Counts both sides: matches you sent and matches you
-- accepted.
--
-- This replaces the testing-mode override in 0028 (has_active_subscription()
-- hard-wired to true) with the real rule, behind a kill switch so nothing
-- changes for anyone until the paywall is deliberately turned on:
--
--   update public.app_settings set value = 'true'::jsonb where key = 'paywall_enabled';
--
-- (service-role / SQL editor only - no app policy lets a user touch this
-- table.) Flip it back to 'false' to return to free-for-everyone with no
-- migration or app release.
--
-- Everything that already calls has_active_subscription() (sending requests,
-- event attendance, need posts, goat roping interest) picks up the rule
-- automatically: with the switch on, a user may do those things while they
-- hold an active subscription OR have fewer than 3 accepted matches.
--
-- Known leak, accepted for now: a user at 2 matches can have several pending
-- requests accepted at once and finish above 3; the next new action is then
-- blocked. Cheap to tighten later by also counting pending requests.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- deliberately no policies: only service-role / SQL editor can read or write.

insert into public.app_settings (key, value) values
  ('paywall_enabled', 'false'::jsonb),
  ('free_matches', '3'::jsonb)
on conflict (key) do nothing;

create or replace function public.accepted_match_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.partner_requests
  where status = 'accepted' and (requester_id = uid or recipient_id = uid);
$$;

create or replace function public.has_active_subscription(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce((select (value)::text = 'true' from public.app_settings where key = 'paywall_enabled'), false)
    or coalesce((select entitlement_active from public.subscriptions where id = uid), false)
    or public.accepted_match_count(uid)
         < coalesce((select (value)::text::integer from public.app_settings where key = 'free_matches'), 3);
$$;

-- What the app needs to show "2 of 3 free matches used" and to prompt before
-- hitting a raw RLS error. Reads only the caller's own numbers.
create or replace function public.get_free_tier_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'paywall_enabled', coalesce((select (value)::text = 'true' from public.app_settings where key = 'paywall_enabled'), false),
    'free_matches', coalesce((select (value)::text::integer from public.app_settings where key = 'free_matches'), 3),
    'matches_used', public.accepted_match_count(auth.uid()),
    'subscribed', coalesce((select entitlement_active from public.subscriptions where id = auth.uid()), false),
    'allowed', public.has_active_subscription(auth.uid())
  );
$$;

revoke all on function public.accepted_match_count(uuid) from public, anon, authenticated;
revoke all on function public.get_free_tier_status() from public, anon;
grant execute on function public.get_free_tier_status() to authenticated;
