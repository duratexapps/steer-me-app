-- Filter chips for Browse Events.
--
-- 1. events.tags: the association that RUNS or SANCTIONS the event, read from
--    the flier's header / large logo (not from "membership accepted" small
--    print and not from sponsor logos). Allowed values: wstr, ustrc, ntr,
--    over40 (the 40+ Team Roping Championships association). Empty = we
--    could not tell; such events still appear under "All".
--    tags_checked_at records that a flier has been read, so "empty because
--    not read yet" and "empty because the flier names no association" can be
--    told apart.
-- 2. hotspots: where the action is right now. The app highlights the
--    chip(s) whose window covers today. Changing seasons is a data edit,
--    no app release.

alter table public.events
  add column tags text[] not null default '{}',
  add column tags_checked_at timestamptz,
  add constraint events_tags_allowed check (tags <@ array['wstr','ustrc','ntr','over40']::text[]);

create index events_tags_idx on public.events using gin (tags);

create table public.hotspots (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- chip label, e.g. "Wickenburg"
  state text not null,                   -- 2-letter code
  towns text[] not null,                 -- event.location "City, ST" matches any of these (case-insensitive city)
  hot_from date,                         -- hot window start (inclusive); both null = never highlighted
  hot_until date,                        -- hot window end (inclusive)
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.hotspots enable row level security;
create policy "hotspots_read" on public.hotspots for select to authenticated using (true);
-- writes: service role / SQL editor only (no policy).

insert into public.hotspots (name, state, towns, hot_from, hot_until, sort_order) values
  ('Wickenburg', 'AZ', array['Wickenburg'], '2026-11-01', '2027-04-30', 10);
