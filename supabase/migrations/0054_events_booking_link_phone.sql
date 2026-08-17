-- Real ask from the user: entrants should be able to book their stall/RV
-- spot straight from an event listing when the venue has a link or phone
-- for it. Nullable, since most venues won't have this filled in yet - the
-- data comes from whoever posts the event (a Draw Pro producer via
-- syncEventToSteerMe, a self-serve Steer Me event, or an admin posting
-- from a flier), not every event will have it.

alter table public.events add column booking_link text;
alter table public.events add column booking_phone text;
