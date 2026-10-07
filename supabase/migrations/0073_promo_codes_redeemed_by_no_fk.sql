-- A producer-only account has no athlete profile, so a foreign key from
-- promo_codes.redeemed_by to profiles would make redeeming fail for them.
-- redeemed_by only records who redeemed; it doesn't need to be enforced.
alter table public.promo_codes drop constraint promo_codes_redeemed_by_fkey;
