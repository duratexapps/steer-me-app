-- Clinics & schools (Justin, 2026-10-24): roping clinics and schools taught by professional ropers, active or retired,
-- listed from fliers by RopingTools (instructors do not post through the app). They are NOT jackpots: no classes, no
-- partner matching, no attendance. A clinic is kept out of the main Events list and shows only under its own
-- "Clinics & schools" chip. Clinics keep the one-placeholder divisions array (same convention as round-robin and
-- pasture ropings), so every existing constraint and query keeps working.

alter table public.events
  add column is_clinic boolean not null default false;

create index events_is_clinic_idx on public.events (event_date) where is_clinic;
