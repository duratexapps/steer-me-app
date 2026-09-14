-- FIXED live 2026-09-13, found while smoke-testing migration 0063: an
-- insert with no matching SELECT policy fails outright when the caller
-- needs RETURNING (Postgres RLS applies the SELECT policy to check
-- visibility of the row before returning it) - the client has to read the
-- generated token back immediately after creating a share to build the
-- share URL/QR code, so this can't be skipped the way "no reason to list
-- past shares" reasoning suggested in 0063's own comment.
create policy "coggins_shares_owner_select" on public.coggins_shares
  for select using (owner_id = auth.uid());
