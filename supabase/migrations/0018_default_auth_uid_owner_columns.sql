-- Proactive sweep for the same bug class as 0016/0017: every "owner" column
-- across the schema that RLS checks against auth.uid() needs a matching
-- default, so a client that (correctly) never supplies its own identity
-- doesn't leave the column NULL and fail the RLS check. profiles.id and
-- producer_profiles.id are set explicitly by client code today (matching
-- the default anyway), but get the default too for defense-in-depth and
-- consistency with every other table here.

alter table public.profiles
  alter column id set default auth.uid();

alter table public.producer_profiles
  alter column id set default auth.uid();

alter table public.events
  alter column producer_id set default auth.uid();

alter table public.event_attendance
  alter column athlete_id set default auth.uid();

alter table public.event_ratings
  alter column athlete_id set default auth.uid();

alter table public.event_reports
  alter column reporter_id set default auth.uid();

alter table public.user_reports
  alter column reporter_id set default auth.uid();
