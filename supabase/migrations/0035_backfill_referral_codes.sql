-- NEW, added 2026-07-28 - real gap found immediately after 0034 first
-- ran against the actual database: profiles_set_referral_code only
-- fires BEFORE INSERT, so every profile that already existed before
-- migration 0034 (15 real test rows, confirmed live) got referral_code
-- left NULL - they'd see a blank code on the Referral screen instead of
-- a real one. One-time backfill using the same generate_referral_code()
-- function new signups already use, so backfilled codes follow the
-- identical format/uniqueness guarantee.
update public.profiles
set referral_code = public.generate_referral_code()
where referral_code is null;
