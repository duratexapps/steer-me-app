-- Same bug class as 0016: blocker_id had no default, so a client insert
-- that only supplies blocked_id (the correct usage) left blocker_id NULL,
-- failing the "auth.uid() = blocker_id" RLS check on every insert. Found via
-- the same smoke test that caught the partner_requests version of this.
alter table public.blocks
  alter column blocker_id set default auth.uid();
