-- Accounts that never have to subscribe (the owner's own accounts, and anyone given free access on purpose).
--
-- has_active_subscription() is the single enforcement point for every paid action, so exemption lives there:
-- a comped user passes it whatever the paywall flag, free-match count or store / Stripe status says.
-- The list is its own table with row level security and NO policies, so no client can read or change it;
-- only the service role and the security-definer functions below do. Add someone with:
--   insert into public.comped_users (user_id, note) select id, 'reason' from auth.users where email = '...';

create table public.comped_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.comped_users enable row level security;

create or replace function public.has_active_subscription(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce((select (value)::text = 'true' from public.app_settings where key = 'paywall_enabled'), false)
    or exists (select 1 from public.comped_users where user_id = uid)
    or coalesce((select entitlement_active from public.subscriptions where id = uid), false)
    or coalesce((select active from public.stripe_subscriptions where user_id = uid), false)
    or public.accepted_match_count(uid)
         < coalesce((select (value)::text::integer from public.app_settings where key = 'free_matches'), 3);
$$;

-- The "subscribed" flag the app reads also counts a comped user, so no screen nags them to subscribe.
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
    'subscribed',
      exists (select 1 from public.comped_users where user_id = auth.uid())
      or coalesce((select entitlement_active from public.subscriptions where id = auth.uid()), false)
      or coalesce((select active from public.stripe_subscriptions where user_id = auth.uid()), false),
    'allowed', public.has_active_subscription(auth.uid())
  );
$$;

insert into public.comped_users (user_id, note)
select id, 'owner account' from auth.users where email in ('test1@steerme.test', 'ropingtools@duratex-ie.com')
on conflict (user_id) do nothing;
