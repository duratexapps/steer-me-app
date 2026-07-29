-- Real gap flagged directly by the user: Steer Me and Draw Pro have a
-- genuine chicken-and-egg cold-start problem - producers have little
-- reason to onboard without contestants, contestants have little reason
-- to use Steer Me for partner-matching without events/other users to
-- match against. Bridges this by letting a trusted admin post real
-- events on a producer's behalf (found on a flier, entered by hand),
-- BEFORE that producer has any account here at all.
--
-- ============================================================
-- TEMPORARY/REMOVABLE FEATURE - same discipline as Draw Pro's demo data
-- generator (see that repo's docs/ARCHITECTURE.md entry): built to
-- bootstrap the cold start, explicitly meant to be turned off (not
-- necessarily deleted - unlike the demo generator, there's no reason
-- this couldn't just stay quietly available) once enough producers are
-- onboarded directly. To disable going forward without removing
-- anything: just stop granting is_admin to any account, or set it back
-- to false on the existing one. The schema/RLS below causes no harm
-- sitting unused - it only ever matters for rows where
-- posted_by_admin = true, which stops accumulating once nobody has
-- admin access.
-- ============================================================
--
-- Deliberately reuses the EXACT mechanism already built for Draw Pro-
-- synced events (migration 0029) rather than inventing a new one:
-- external_producer_name (already exists) carries the real producer's
-- name with no real producer_profiles account behind it - exactly the
-- same situation, just a different source. posted_by_admin is the ONLY
-- new marker needed to tell "synced from real Draw Pro" apart from
-- "an admin typed this in by hand from a flier" - EventCard shows a
-- small clarifier for the latter, per direct instruction: "should show
-- the producer name & info but clarify that it is an admin post."
--
-- Engagement tracking needs NO new work at all - event_attendance and
-- partner_requests already track per-event, and an admin-posted event
-- is just a normal row in the same events table. That's the whole
-- point of building this here instead of through Draw Pro (see the
-- chat discussion this same day) - the tracking a producer would
-- actually want to see already exists.

alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants access to admin-only actions (currently: posting an event on '
  'a producer''s behalf before they have their own account - see '
  'events.posted_by_admin). Not exposed on public_profiles - nobody '
  'else needs to see who has this.';

alter table public.events
  add column posted_by_admin boolean not null default false,
  add column admin_poster_id uuid references public.profiles(id);

comment on column public.events.posted_by_admin is
  'true for an event a trusted admin entered on a producer''s behalf '
  '(from a flier, before that producer has any Steer Me or Draw Pro '
  'account) - the cold-start bootstrap path. external_producer_name '
  'carries the real producer''s name, same field Draw-Pro-synced '
  'events already use for the same "no real producer account behind '
  'this" situation.';
comment on column public.events.admin_poster_id is
  'Which admin account posted this - accountability only, not shown '
  'publicly.';

-- The existing constraint (migration 0029) only allowed a real
-- producer_id or a draw_pro_event_id - admin-posted events have
-- neither, so this needs a third valid path.
alter table public.events
  drop constraint events_producer_or_draw_pro_source;

alter table public.events
  add constraint events_producer_or_draw_pro_or_admin_source check (
    producer_id is not null or draw_pro_event_id is not null or posted_by_admin = true
  );

-- Admin insert: posted_by_admin must be true, admin_poster_id must be
-- the caller's own id (no posting as someone else), and the caller must
-- actually have is_admin = true. Deliberately does NOT let an admin
-- also set producer_id or draw_pro_event_id on the same row - keeps
-- "how did this event get here" unambiguous per row, one source, not a
-- mix.
create policy "events_insert_admin" on public.events
  for insert with check (
    posted_by_admin = true
    and producer_id is null
    and draw_pro_event_id is null
    and admin_poster_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Lets an admin edit/remove a mistake (wrong date typed from a flier,
-- event cancelled, etc.) - any admin can manage any admin-posted event,
-- not just the one they personally posted, since this is a small,
-- trusted shared pool, not per-admin ownership.
create policy "events_update_admin" on public.events
  for update using (
    posted_by_admin = true
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (
    posted_by_admin = true
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "events_delete_admin" on public.events
  for delete using (
    posted_by_admin = true
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
