-- Real gap flagged directly by the user: a roping can run several days
-- (e.g. 8/2-8/8), but events.event_date has only ever been a single
-- date. Adding event_end_date (nullable - null means single-day, same
-- as event_date) rather than renaming event_date itself, since
-- event_date is already referenced throughout this codebase as "the
-- anchor date" for sorting/upcoming-vs-past logic - keeping it as the
-- START date means every existing ORDER BY/comparison against it stays
-- correct with zero changes, and only code that needs to know about the
-- END date (display, "is this event still relevant today") needs to
-- change at all.
alter table public.events
  add column event_end_date date;

comment on column public.events.event_end_date is
  'NULL for a single-day event (event_date alone is the whole story). '
  'When set, the event runs from event_date through event_end_date '
  'inclusive - e.g. a week-long roping. Always >= event_date, enforced '
  'below. "Is this event still upcoming/relevant" should check '
  'coalesce(event_end_date, event_date) >= today, not event_date alone, '
  'or a multi-day event still in progress would incorrectly look "past" '
  'once its start date passes.';

alter table public.events
  add constraint event_end_date_after_start check (event_end_date is null or event_end_date >= event_date);
