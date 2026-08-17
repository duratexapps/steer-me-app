-- Perf pass, 2026-08-16: none of these tables had an explicit index
-- supporting their most frequent WHERE-clause column - each was relying
-- on a primary/unique key that doesn't lead with the column actually
-- filtered on, so Postgres fell back to a wider scan. All four are hit
-- on high-traffic screens (main Events feed, My Requests inbox, event
-- attendance check, and the Post-a-Need "search for your event" step).

-- events: usePublishedEvents() filters status='published' and orders by
-- event_date on every load of the main Events tab, for every user.
create index events_status_event_date_idx on public.events (status, event_date);

-- event_attendance: primary key is (event_id, division, athlete_id), so
-- filtering by athlete_id alone (useMyAttendance, run on every Events tab
-- load) can't use it as an efficient leading-column lookup.
create index event_attendance_athlete_id_idx on public.event_attendance (athlete_id);

-- partner_requests: the only existing index is the unique constraint
-- leading with requester_id. useReceivedRequests() filters by
-- recipient_id, the other side of every request - hit on every My
-- Requests inbox load.
create index partner_requests_recipient_id_idx on public.partner_requests (recipient_id);

-- need_posts: event_id (added by migration 0024) never got a supporting
-- index. useNeedPostCountForEvent() filters on it during Post-a-Need's
-- "search for your event" step.
create index need_posts_event_id_idx on public.need_posts (event_id);
