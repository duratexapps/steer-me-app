-- Draw Pro <-> Steer Me event continuity. A producer creates their event
-- once, in Draw Pro (the richer data model - classes, caps, pricing lives
-- there, not here), and Draw Pro's event-setup.jsw syncs a lightweight
-- companion row into this table via the Supabase REST API using a
-- service-role key stored in Wix Secrets Manager - see event-setup.jsw for
-- the actual sync call. This is what DrawProEvents.steerMeEventId was
-- always meant to point at; that field existed with no code behind it
-- until now.
--
-- Draw Pro producers authenticate via Wix Members, not Supabase Auth -
-- there's no guaranteed Steer Me account (or producer_profiles row) behind
-- a Draw Pro producer, so producer_id has to become nullable rather than
-- assuming one exists. external_producer_name carries a plain-text org
-- name for exactly that case, since there's no real producer_profiles row
-- to join against for display.

alter table public.events
  alter column producer_id drop not null;

alter table public.events
  add column draw_pro_event_id text,
  add column draw_pro_entry_url text,
  add column external_producer_name text;

-- Idempotency for the sync call - re-syncing the same Draw Pro event
-- (e.g. after a producer edits it) should update the existing row, not
-- create a duplicate listing.
create unique index events_draw_pro_event_id_key
  on public.events (draw_pro_event_id)
  where draw_pro_event_id is not null;

-- A synced event has no Steer Me producer to require non-null producer_id
-- for real self-serve listings created directly in Steer Me. Both cases
-- are covered: normal Steer Me events still require a producer; synced
-- ones require the Draw Pro reference instead.
alter table public.events
  add constraint events_producer_or_draw_pro_source check (
    producer_id is not null or draw_pro_event_id is not null
  );
