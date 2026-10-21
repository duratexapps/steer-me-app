-- Web subscriptions through Stripe (Route A: checkout on steerme.ropingtools.com; Apple / Google purchases stay
-- in the app and are untouched).
--
-- Design: the existing `subscriptions` table is the RevenueCat cache and its webhook is its only writer, so
-- Stripe gets its OWN table. "Is this person subscribed?" is then true if EITHER source says yes. Nothing here
-- can switch off an existing Apple / Google subscriber, and an Apple expiry cannot switch off a Stripe one.
-- A person on both shows as subscribed once, with the source noted (get_subscription_status).
--
-- web_checkout_enabled is a server switch, OFF until live Stripe keys are in place, so a sandbox (test-card)
-- checkout can never grant real access to real users.

insert into public.app_settings (key, value) values ('web_checkout_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table public.stripe_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  active boolean not null default false,
  price_lookup_key text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_subscriptions enable row level security;

-- Signed-in users can read only their own row. No client can write; only the Stripe Edge Functions
-- (service role) do.
create policy "stripe_subscriptions_select_own" on public.stripe_subscriptions
  for select using (auth.uid() = user_id);

create trigger stripe_subscriptions_set_updated_at
  before update on public.stripe_subscriptions
  for each row execute function public.set_updated_at();

-- Gate used by RLS: either source counts. (Same free-matches and paywall logic as 0069.)
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
    or coalesce((select active from public.stripe_subscriptions where user_id = uid), false)
    or public.accepted_match_count(uid)
         < coalesce((select (value)::text::integer from public.app_settings where key = 'free_matches'), 3);
$$;

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
      coalesce((select entitlement_active from public.subscriptions where id = auth.uid()), false)
      or coalesce((select active from public.stripe_subscriptions where user_id = auth.uid()), false),
    'allowed', public.has_active_subscription(auth.uid())
  );
$$;

-- One call for the Subscription screen: combined status, which source(s), and whether the web free month is
-- still available. A person is trial-eligible only if they have never had a Stripe subscription and are not
-- already subscribed some other way.
create or replace function public.get_subscription_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  store_active boolean;
  store_expires timestamptz;
  store_product text;
  w public.stripe_subscriptions%rowtype;
  checkout_on boolean;
  web_active boolean;
begin
  select entitlement_active, expires_at, product_id
    into store_active, store_expires, store_product
    from public.subscriptions where id = auth.uid();
  store_active := coalesce(store_active, false);

  select * into w from public.stripe_subscriptions where user_id = auth.uid();
  web_active := coalesce(w.active, false);

  checkout_on := coalesce(
    (select (value)::text = 'true' from public.app_settings where key = 'web_checkout_enabled'), false);

  return jsonb_build_object(
    'entitlement_active', store_active or web_active,
    'source', case
                when store_active and web_active then 'both'
                when web_active then 'web'
                when store_active then 'store'
                else null end,
    'product_id', store_product,
    'expires_at', case
                    when web_active and store_active then greatest(store_expires, w.current_period_end)
                    when web_active then w.current_period_end
                    else store_expires end,
    'web_active', web_active,
    'web_status', w.status,
    'web_cancel_at_period_end', coalesce(w.cancel_at_period_end, false),
    'web_trial_end', w.trial_end,
    'web_has_customer', w.stripe_customer_id is not null,
    'web_checkout_enabled', checkout_on,
    'web_trial_eligible', (w.stripe_subscription_id is null) and not store_active
  );
end;
$$;

revoke all on function public.get_subscription_status() from public, anon;
grant execute on function public.get_subscription_status() to authenticated;
