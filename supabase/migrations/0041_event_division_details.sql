-- Real ask, directly from the user, about how posted events actually
-- read: "The human eye naturally drifts to the event classes your
-- subconsciously interested in only to realize those details are not
-- there. They are grouped above with everything else... Any details
-- that are common the whole event no matter the class & no matter the
-- day should be listed above the classes & below the header. Details
-- pertaining to each class (cost to enter, end caps, max entries etc)
-- should be listed WITH the checkbox indicating attendance."
--
-- Before this, an event had exactly one entry_fee string and one
-- description string for the WHOLE event, even though real fliers
-- (confirmed with the first 4 real events posted) routinely charge a
-- different fee, cap, and steer count PER DIVISION/CLASS - all of that
-- detail was getting crammed into the single shared description field,
-- sitting above the division list, disconnected from the specific
-- division a reader actually cares about.
--
-- division_details is a JSON object keyed by division number (as a
-- string, e.g. "9.5"), each value a short free-text blob for that one
-- division's own details - same free-text flexibility the whole-event
-- description field already had, just scoped per division instead of
-- the whole event. Deliberately NOT a rigid set of typed sub-fields
-- (feeAmount/capNumber/maxEntries as separate columns) - real fliers
-- vary wildly in which details they even list (some show a steer count,
-- some show P1/D2/D3 restrictions, some show a heeler-only sub-cap),
-- and a producer/admin transcribing straight from a flier needs the
-- same "just type what it says" freedom for a class as they already
-- have for the whole event.
--
-- Nullable/optional - an event with no per-division breakdown at all
-- (the common case for a simple single-fee event) just keeps showing
-- entry_fee as one shared line, unchanged from before this migration.
alter table public.events
  add column division_details jsonb;

comment on column public.events.division_details is
  'Optional per-division free-text details (e.g. {"9.5": "$140/man, '
  'capped #5.5, enter 4x, 3 steer avg"}), shown alongside that '
  'division''s own attendance checkbox rather than mixed into the '
  'shared, whole-event description. Null/absent for a division means '
  'no class-specific breakdown was given - the event''s shared '
  'entry_fee applies to it instead.';
