-- Marking "attending" a specific event+division. Broad authenticated SELECT
-- is safe here: rows only contain event_id/division/athlete_id, and any join
-- back to a profile goes through public_profiles, so no sensitive columns
-- are reachable through this table. INSERT is gated on an active
-- subscription per the Pricing & Fees doc (event browsing/attendance is a
-- subscription feature) and on the athlete not being suspended.

create table public.event_attendance (
  event_id uuid not null references public.events(id) on delete cascade,
  division numeric(3,1) not null,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, division, athlete_id)
);

alter table public.event_attendance enable row level security;

create policy "event_attendance_select_all" on public.event_attendance
  for select using (auth.role() = 'authenticated');

create policy "event_attendance_insert_own" on public.event_attendance
  for insert with check (
    athlete_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and public.has_active_subscription(auth.uid())
  );

create policy "event_attendance_delete_own" on public.event_attendance
  for delete using (athlete_id = auth.uid());
