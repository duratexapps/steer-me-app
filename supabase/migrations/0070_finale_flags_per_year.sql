-- WSTR Finale flags, per Finale year, markable year-round.
--
-- 0066/0067 kept ONE Finale year on the profile, and the app only offered the
-- year that ends on Dec 15. In practice next year's qualifiers start before
-- this year's Finale has even run (a 2027 qualifier is held in November 2026),
-- so a roper can legitimately be flagged for two Finales at once. Flags move
-- to their own table, one row per (roper, Finale year).
--
-- Verified before writing this: no profile had a Finale flag set, so nothing
-- needs copying across. The old profile columns and the 0067 constraints go.
--
-- A year's flags stop being shown to other ropers after Dec 15 of that year
-- (same cutoff as before); the rows stay, so there is no cleanup job.

drop view public.public_profiles;

alter table public.profiles
  drop constraint profiles_finale_qualified_both_or_neither,
  drop constraint profiles_finale_qualified_classes_valid,
  drop column finale_qualified_year,
  drop column finale_qualified_classes,
  drop column finale_buy_in_year;

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
  membership_expiration_date
from public.profiles
where not suspended
  and not hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;

create table public.finale_flags (
  user_id uuid not null references public.profiles(id) on delete cascade,
  finale_year smallint not null check (finale_year between 2026 and 2100),
  qualified_classes numeric(3,1)[],
  buy_in boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, finale_year),
  constraint finale_flags_something_set check (qualified_classes is not null or buy_in),
  constraint finale_flags_classes_valid check (
    qualified_classes is null
    or (
      cardinality(qualified_classes) between 1 and 12
      and qualified_classes <@ array[3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0,8.5,9.0,9.5,10.0,10.5,11.0,11.5,12.0,12.5,13.0,13.5,14.0,14.5,15.0,15.5,16.0,16.5,17.0,17.5,18.0,18.5,19.0]::numeric[]
    )
  )
);

comment on table public.finale_flags is
  'Self-reported WSTR Finale status, one row per roper per Finale year: classes they are qualified in (and need a partner for) and/or willingness to buy in. Other ropers read it only through public_finale_flags.';

alter table public.finale_flags enable row level security;

create policy "finale_flags_own_all" on public.finale_flags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- What other ropers may see: only current years, only visible profiles, never
-- across a block. Runs as the view owner so it can read other users' rows.
create view public.public_finale_flags
with (security_invoker = false) as
select
  f.user_id,
  f.finale_year,
  f.qualified_classes,
  f.buy_in
from public.finale_flags f
join public.profiles p on p.id = f.user_id
where now() < make_date(f.finale_year::int, 12, 15)
  and not p.suspended
  and not p.hidden_from_matching
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), f.user_id));

grant select on public.public_finale_flags to authenticated;
