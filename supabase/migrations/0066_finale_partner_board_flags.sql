-- WSTR Finale partner board. Two permanent, self-declared profile flags:
--
--   finale_qualified_year + finale_qualified_class
--       "I'm qualified for the WSTR Finale of <year> in class #<class> and
--       need a partner." Real-world need this addresses: a team wins a
--       qualifier, but the drawn partner was already qualified (or bought
--       in), leaving the other roper qualified with no partner. There is no
--       blind draw at the Finale, so they have to find another stranded
--       qualifier in the same class.
--
--   finale_buy_in_year
--       "I'll buy my way into the Finale for a stranded qualifier." The
--       roper's own classification decides which classes they can actually
--       fit (same canPair() math as everywhere else), so no class is stored.
--
-- Both are SELF-REPORTED and unverified - the app labels them that way and
-- the existing Report flow covers misuse. They are meant to stay as
-- permanent features: users flip them on and off year-round as they qualify
-- or change their mind.
--
-- A flag is tied to a Finale YEAR on purpose, and public_profiles stops
-- exposing it after Dec 15 of that year (the Finale runs in early/mid
-- December), so last season's flags never linger into the next cycle. The
-- owner's own row still keeps the raw values (profiles.* is owner-only).

alter table public.profiles
  add column finale_qualified_year smallint,
  add column finale_qualified_class numeric(3,1),
  add column finale_buy_in_year smallint;

alter table public.profiles
  add constraint profiles_finale_qualified_both_or_neither
    check ((finale_qualified_year is null) = (finale_qualified_class is null)),
  add constraint profiles_finale_qualified_class_range
    check (finale_qualified_class is null or finale_qualified_class between 3 and 19),
  add constraint profiles_finale_qualified_year_range
    check (finale_qualified_year is null or finale_qualified_year between 2026 and 2100),
  add constraint profiles_finale_buy_in_year_range
    check (finale_buy_in_year is null or finale_buy_in_year between 2026 and 2100);

comment on column public.profiles.finale_qualified_year is
  'Self-reported: Finale year this roper is qualified for. Null = not qualified. Paired with finale_qualified_class.';
comment on column public.profiles.finale_qualified_class is
  'Self-reported: the Finale class (#) they qualified in. Null whenever finale_qualified_year is null.';
comment on column public.profiles.finale_buy_in_year is
  'Self-reported: Finale year this roper will buy in for a stranded qualified partner. Null = not offering.';

-- Same definition as 0060, plus three new columns APPENDED at the end
-- (CREATE OR REPLACE VIEW only allows adding columns at the end). The flags
-- are blanked once their Finale year has passed (Dec 15 cutoff).
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
  membership_expiration_date,
  case when finale_qualified_year is not null
        and now() < make_date(finale_qualified_year::int, 12, 15)
       then finale_qualified_year end as finale_qualified_year,
  case when finale_qualified_year is not null
        and now() < make_date(finale_qualified_year::int, 12, 15)
       then finale_qualified_class end as finale_qualified_class,
  case when finale_buy_in_year is not null
        and now() < make_date(finale_buy_in_year::int, 12, 15)
       then finale_buy_in_year end as finale_buy_in_year
from public.profiles
where not suspended
  and not hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;
