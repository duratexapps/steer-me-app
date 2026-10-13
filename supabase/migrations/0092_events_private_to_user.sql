-- Private demo events. A published event can now be visible to ONE account only,
-- so a throwaway demo event (a Draw Pro event cross-posted to Steer Me) can appear in
-- Browse with a working "Enter the Draw" button on a single tester's phone without any
-- real rider ever seeing it. Null (the default, and every existing row) means public,
-- exactly as before. Added 2026-10-12 for the Draw Pro + Steer Me demo.
--
-- To undo: set the column back to null on the row, or drop the column and restore the
-- previous policy `status = 'published' or producer_id = auth.uid()`.

alter table public.events
  add column if not exists private_to_user_id uuid references public.profiles(id) on delete set null;

comment on column public.events.private_to_user_id is
  'When set, a published event is visible only to this user (and its producer). Null = public. Used for demo events.';

drop policy if exists events_select_published_or_own on public.events;

create policy events_select_published_or_own
  on public.events
  for select
  to public
  using (
    (status = 'published' and (private_to_user_id is null or private_to_user_id = auth.uid()))
    or producer_id = auth.uid()
  );
