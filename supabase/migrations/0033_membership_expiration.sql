-- NEW, added 2026-07-27 - real policy decision from the user: an expired
-- Global Handicap card should NOT block someone from using the platform
-- (unlike a name/ID/classification-number mismatch, which genuinely
-- suggests fraud and does block, per verify-classification-card).
-- Expiration is different - it's a real, common, non-fraudulent
-- situation (memberships lapse), so the right move is to let the person
-- keep using the app, but make their non-current status visible to
-- other users deciding whether to match with them, so THEY can weigh it
-- rather than a rule silently deciding for everyone.
alter table public.profiles
  add column membership_expiration_date date;

comment on column public.profiles.membership_expiration_date is
  'Extracted from the user''s last-verified Global Handicap card by '
  'verify-classification-card. NULL means never successfully read (not '
  'the same as expired) - only flag "not current" when this is set AND '
  'in the past, never on NULL. See src/lib/matching.ts''s '
  'isMembershipCurrent().';

-- Exposed the same safe-columns-only way as header_classification/
-- heeler_classification were in migration 0030 - other users need to see
-- this to decide whether to match with someone, same reasoning as why
-- classification numbers themselves are public.
--
-- FIXED live 2026-07-28, alongside 0030's own fix: column order here
-- must exactly match whatever 0030 leaves the view as (Postgres only
-- allows CREATE OR REPLACE VIEW to APPEND new columns at the very end,
-- never reorder/insert existing ones) - updated to match 0030's
-- corrected order, with membership_expiration_date appended after it.
create or replace view public.public_profiles
with (security_invoker = false) as
select
  id,
  full_name,
  "position",
  home_area,
  global_classification,
  avatar_url,
  is_minor,
  header_classification,
  heeler_classification,
  membership_expiration_date
from public.profiles
where not suspended
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;
