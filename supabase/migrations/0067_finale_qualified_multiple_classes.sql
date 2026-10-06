-- WSTR Finale partner board: a roper can be qualified in MORE THAN ONE Finale
-- class (any class where their number plus their partner's number is at or
-- under that class's cap), so 0066's single finale_qualified_class becomes a
-- list. Safe to replace outright: verified no profile had a Finale flag set
-- when this migration was written.
--
-- The view has to be dropped and recreated rather than CREATE OR REPLACEd,
-- because Postgres won't let a replaced view remove or retype a column.

drop view public.public_profiles;

alter table public.profiles
  drop constraint profiles_finale_qualified_both_or_neither,
  drop constraint profiles_finale_qualified_class_range,
  drop column finale_qualified_class;

alter table public.profiles
  add column finale_qualified_classes numeric(3,1)[];

alter table public.profiles
  add constraint profiles_finale_qualified_both_or_neither
    check ((finale_qualified_year is null) = (finale_qualified_classes is null)),
  add constraint profiles_finale_qualified_classes_valid
    check (
      finale_qualified_classes is null
      or (
        cardinality(finale_qualified_classes) between 1 and 12
        and finale_qualified_classes <@ array[3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0,8.5,9.0,9.5,10.0,10.5,11.0,11.5,12.0,12.5,13.0,13.5,14.0,14.5,15.0,15.5,16.0,16.5,17.0,17.5,18.0,18.5,19.0]::numeric[]
      )
    );

comment on column public.profiles.finale_qualified_classes is
  'Self-reported: every Finale class (#) this roper is qualified in. Null whenever finale_qualified_year is null; otherwise 1-12 values.';

create view public.public_profiles
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
       then finale_qualified_classes end as finale_qualified_classes,
  case when finale_buy_in_year is not null
        and now() < make_date(finale_buy_in_year::int, 12, 15)
       then finale_buy_in_year end as finale_buy_in_year
from public.profiles
where not suspended
  and not hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;
