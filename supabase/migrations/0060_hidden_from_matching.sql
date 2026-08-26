-- NEW, added 2026-08-26 - need to hide a specific account (the Apple App
-- Review demo login) from the partner-matching list without deleting it
-- or blocking its login. `suspended` looks like the obvious flag, but per
-- migration 0014 it's wired to a webhook that actually bans the account's
-- auth session - the wrong tool here, since Apple's reviewers need to
-- keep signing in. `hidden_from_matching` is a separate, narrower flag:
-- it only removes the profile from public_profiles (what
-- useEligiblePartners/browse.tsx query), everything else about the
-- account keeps working normally.
alter table public.profiles
  add column hidden_from_matching boolean not null default false;

comment on column public.profiles.hidden_from_matching is
  'True for accounts that should never appear in partner matching/browse '
  '(e.g. the Apple App Review demo login) but must keep working '
  'normally otherwise - distinct from suspended, which bans the '
  'account''s login via the ban webhook (see 0014_ban_suspended_webhook.sql).';

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
  and not hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;
