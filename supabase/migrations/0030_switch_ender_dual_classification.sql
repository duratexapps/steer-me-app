-- Real bug found live 2026-07-25: a Switch Ender (someone who ropes both
-- ends) was forced into a single global_classification number used for
-- BOTH ends, but header and heeler ratings are assessed independently and
-- commonly differ (e.g. a real 6.5 header / 8.0 heeler combination) - see
-- MAX_HEADER_NUMBER (9) vs MAX_HEELER_NUMBER (10) in src/lib/matching.ts,
-- which already encodes that headers and heelers have different valid
-- ranges. The prior "one number, used for either end" design in
-- 0023_switch_ender_position.sql's canPair() was a real logical flaw,
-- not just a missing form field - it could accept a number invalid for
-- whichever end was actually being evaluated.
--
-- Header-only and Heeler-only ropers are UNCHANGED - global_classification
-- stays exactly as it was for them, no migration needed, since their
-- single number unambiguously represents their one end already. Only
-- Switch Enders get the two new columns.
--
-- Existing Switch Ender profiles: their existing global_classification
-- number cannot be safely split into header/heeler (no way to know which
-- end it represented, or whether it represented both equally). Per
-- explicit decision, cleared to NULL rather than guessed - existing
-- Switch Enders must re-verify both numbers before matching/eligibility
-- will work for them again. This is a deliberate accuracy-over-convenience
-- tradeoff, not an oversight.

alter table public.profiles
  add column header_classification numeric(3,1),
  add column heeler_classification numeric(3,1);

comment on column public.profiles.header_classification is
  'Switch Enders only - their classification number specifically as a header. Header/Heeler-only ropers use global_classification instead.';
comment on column public.profiles.heeler_classification is
  'Switch Enders only - their classification number specifically as a heeler. Header/Heeler-only ropers use global_classification instead.';

-- Clear the ambiguous single number for existing Switch Enders - forces
-- re-verification via the app's existing update-classification flow
-- before they can be matched again. global_classification is not used
-- for Switch Enders going forward (header_classification/
-- heeler_classification replace it for them specifically), so clearing
-- it here doesn't lose anything still in use.
update public.profiles
set global_classification = null
where "position" = 'Switch';

-- Both the public_profiles view (0004) and get_blocked_profiles() RPC
-- (0015) need the two new columns exposed the same way
-- global_classification already is - same safe-columns-only pattern,
-- just extended.
--
-- FIXED live 2026-07-28, before this migration had ever successfully run
-- against a real database: the first version of this migration inserted
-- header_classification/heeler_classification in the MIDDLE of the view's
-- column list (between global_classification and avatar_url). Postgres's
-- CREATE OR REPLACE VIEW only allows new columns to be appended at the
-- END of the existing column list - inserting them anywhere else is
-- rejected outright ("cannot change name/order of view columns"), which
-- is exactly the error this produced on the real first attempt to push
-- these migrations. Reordered below to append both new columns after
-- is_minor instead. migration 0033 (membership_expiration_date) also
-- needed its own matching fix, since its view redefinition has to
-- exactly match whatever column order this migration leaves behind.
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
  heeler_classification
from public.profiles
where not suspended
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;

-- FIXED live 2026-07-28, same real-run discovery as the view above, but a
-- stricter version of the same rule: Postgres does not allow
-- CREATE OR REPLACE FUNCTION to change a RETURNS TABLE(...) function's
-- output columns AT ALL (not even appending at the end, unlike a view) -
-- it requires dropping the function first. The original version of this
-- statement (`create or replace function ...`) would have failed the
-- same way the view did, the instant it was reached.
drop function if exists public.get_blocked_profiles();

create function public.get_blocked_profiles()
returns table (
  id uuid,
  full_name text,
  "position" text,
  home_area text,
  global_classification numeric,
  avatar_url text,
  header_classification numeric,
  heeler_classification numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.position, p.home_area, p.global_classification,
         p.avatar_url, p.header_classification, p.heeler_classification
  from public.profiles p
  join public.blocks b on b.blocked_id = p.id
  where b.blocker_id = auth.uid();
$$;

grant execute on function public.get_blocked_profiles() to authenticated;
