-- Promo codes: single-use codes that grant free subscription time through
-- RevenueCat's promotional entitlements (same mechanism the refer-a-friend
-- reward uses). Created by hand / script with the service role; redeemed
-- through the redeem-promo-code Edge Function, which is the only thing that
-- writes redeemed_by / redeemed_at. No RLS policies on purpose: the table is
-- invisible to the app and its users.
--
-- assigned_user_id, when set, means only that account may redeem the code
-- (codes handed out as an apology/thank-you shouldn't be forwardable).
-- Codes only redeem once the paywall is on (app_settings.paywall_enabled, see
-- 0069), so free time starts when charging starts, not while everyone is free.

create table public.promo_codes (
  code text primary key,
  duration text not null default 'three_month'
    check (duration in ('monthly', 'two_month', 'three_month', 'six_month', 'yearly', 'daily')),
  assigned_user_id uuid references public.profiles(id) on delete set null,
  note text,
  expires_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
