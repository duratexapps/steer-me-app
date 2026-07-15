-- RevenueCat entitlement cache. References auth.users directly (not
-- profiles) so a subscription can sync in even if it lands before an
-- athlete profile row exists. No client role ever gets INSERT/UPDATE/DELETE
-- here - the only writer is the revenuecat-webhook Edge Function, which uses
-- the service role key and therefore bypasses RLS entirely. Every RLS policy
-- that gates a paid action calls has_active_subscription() so the server -
-- not the client SDK - is the actual enforcement point.

create table public.subscriptions (
  id uuid primary key references auth.users(id) on delete cascade,
  entitlement_active boolean not null default false,
  product_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER for the same reason as is_suspended(): policies need to
-- check the CALLER's own row, which they could read anyway via the policy
-- above, but keeping it definer keeps this consistent/safe if ever called
-- with someone else's id.
create or replace function public.has_active_subscription(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select entitlement_active from public.subscriptions where id = uid), false);
$$;
