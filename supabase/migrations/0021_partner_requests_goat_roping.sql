-- Responding to a goat-roping need post creates a partner_request with no
-- numeric division at all (goat roping isn't bound by the classification
-- system) - division has to become nullable to allow that. is_goat_roping
-- is a small denormalization (set at insert time from the need post) so
-- My Requests can show "Goat Roping" instead of "{division} roping"
-- without an extra join back through need_posts on every render.

alter table public.partner_requests
  alter column division drop not null;

alter table public.partner_requests
  add column is_goat_roping boolean not null default false;

alter table public.partner_requests
  add constraint partner_requests_division_required_unless_goat
    check (is_goat_roping or division is not null);

-- The existing unique index coalesces event_id (nullable) to a sentinel so
-- NULL-vs-NULL rows still dedupe, but it references division directly -
-- now that division can also be NULL (goat roping), the same problem
-- applies there: two goat-roping requests to the same person wouldn't be
-- caught as duplicates without the same coalesce treatment.
drop index public.partner_requests_unique_key;

create unique index partner_requests_unique_key
  on public.partner_requests (
    requester_id,
    recipient_id,
    coalesce(division, -1),
    coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
