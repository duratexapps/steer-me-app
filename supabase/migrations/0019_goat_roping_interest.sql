-- Goat roping isn't bound by the header/heeler classification-cap system at
-- all (per the user's correction: it's typically a youth event scored
-- individually, not a capped team). So instead of the numeric eligibility
-- math every other "Post a Need" option uses, selecting Goat Roping just
-- registers interest and shows everyone else who's also registered - same
-- reasoning as event_attendance (rows only ever get displayed by joining
-- through public_profiles, which already filters blocked/suspended users),
-- so a broad authenticated SELECT here is safe.

create table public.goat_roping_interest (
  athlete_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.goat_roping_interest enable row level security;

create policy "goat_roping_interest_select_all" on public.goat_roping_interest
  for select using (auth.role() = 'authenticated');

create policy "goat_roping_interest_insert_own" on public.goat_roping_interest
  for insert with check (
    athlete_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and public.has_active_subscription(auth.uid())
  );

create policy "goat_roping_interest_delete_own" on public.goat_roping_interest
  for delete using (athlete_id = auth.uid());
