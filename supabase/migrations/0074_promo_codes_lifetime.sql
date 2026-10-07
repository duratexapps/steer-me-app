-- Allow a lifetime promo code (goodwill for a long-time contributor).
alter table public.promo_codes drop constraint promo_codes_duration_check;
alter table public.promo_codes add constraint promo_codes_duration_check
  check (duration in ('daily', 'monthly', 'two_month', 'three_month', 'six_month', 'yearly', 'lifetime'));
