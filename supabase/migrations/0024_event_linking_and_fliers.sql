-- Three additions from user feedback:
--
-- 1. Producers could never attach a flier to an event listing at all
--    (only athletes' posted needs could) - closing that gap.
-- 2. Posted needs never collected an event location, even though Events
--    (producer listings) always did - closing that gap too, and it's what
--    location-based sorting on the Post feed needs to work at all.
-- 3. A posted need can now optionally link to a real, already-listed
--    event (event_id) - chosen over full duplication of event fields, so
--    multiple athletes posting a need for the SAME real event end up
--    genuinely consolidated (queryable by shared event_id) rather than
--    each just typing their own disconnected copy of the same event's
--    details. The link is a pure cross-reference: event_name/event_date/
--    producer_name/location stay directly stored on every need_post
--    regardless of linking (auto-filled from the picked event at creation
--    time when linked, typed manually otherwise) - this keeps every
--    existing query (the "is this still open" date filter, display, etc.)
--    working against always-populated columns instead of needing to
--    handle a null date/name that only resolves via a join.

alter table public.events
  add column flier_path text;

insert into storage.buckets (id, name, public)
values ('event-fliers', 'event-fliers', true)
on conflict (id) do nothing;

-- event-fliers: public read (same reasoning as need-fliers - the whole
-- point is broad visibility), owner-only write, keyed by producer_id.
create policy "event_fliers_public_read"
on storage.objects for select
using (bucket_id = 'event-fliers');

create policy "event_fliers_owner_insert" on storage.objects for insert
with check (bucket_id = 'event-fliers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "event_fliers_owner_delete" on storage.objects for delete
using (bucket_id = 'event-fliers' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.need_posts
  add column event_id uuid references public.events(id) on delete set null,
  add column location text;
