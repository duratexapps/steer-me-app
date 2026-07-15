-- Bug fix found via smoke testing: requester_id had no default, so a client
-- insert that only supplies recipient_id/division (the correct, intended
-- usage - a client should never be trusted to self-report who it is) left
-- requester_id NULL, which then failed the "requester_id = auth.uid()" RLS
-- check on every insert. Defaulting it to auth.uid() is what the RLS check
-- was already assuming; the check itself stays as defense-in-depth in case
-- a client ever explicitly (and wrongly) supplies a different value.
alter table public.partner_requests
  alter column requester_id set default auth.uid();
