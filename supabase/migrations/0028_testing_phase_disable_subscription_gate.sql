-- TESTING MODE - temporary override, meant to be reverted.
--
-- has_active_subscription() is the real enforcement point for every paid
-- action (partner_requests, event_attendance, need_posts,
-- goat_roping_interest all call it directly in their RLS policies) - the
-- client-side useRequireSubscription() hook is only a UX nicety that shows
-- a friendly prompt instead of a raw Postgres error, it was never the
-- actual gate. Disabling only the client hook (which was done alongside
-- this migration) would have done nothing on its own - real enforcement
-- lives here.
--
-- Per the agreed testing-phase plan: free access for everyone, no
-- subscription required, until a deliberate paywall cutover later. At that
-- cutover: give every current user's usage a "clean slate" (reset
-- whatever usage counters exist by then, keep their actual account/data),
-- then require a subscription after 3 free partner requests sent OR 3
-- accepted matches, whichever comes first - that counter doesn't exist
-- yet and needs to be designed/built as part of the real cutover, not
-- before.
--
-- TO REVERT once ready to actually launch subscriptions: re-run the
-- original body from migration 0005_subscriptions.sql, i.e.
--   create or replace function public.has_active_subscription(uid uuid)
--   returns boolean language sql stable security definer set search_path = public
--   as $$ select coalesce((select entitlement_active from public.subscriptions where id = uid), false); $$;
-- as a new migration (don't edit this file after it's applied).

create or replace function public.has_active_subscription(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select true;
$$;
