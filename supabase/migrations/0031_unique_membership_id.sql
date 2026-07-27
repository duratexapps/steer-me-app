-- NEW, added 2026-07-27, closing a real gap flagged directly by the user:
-- global_membership_id has had NO uniqueness constraint since it was
-- created (migration 0002) - meaning nothing has ever stopped two
-- different Steer Me accounts from claiming the SAME real person's
-- membership ID. That's the actual exploit being described, not a card-
-- photo problem: since Global Handicap's own classification lookup has
-- no photo/biometric tie to a member ID, anyone who knows another real
-- person's name + member ID could create a Steer Me account claiming to
-- BE that person, at whatever classification they choose to type in.
--
-- This constraint doesn't require OCR, doesn't require knowing anything
-- about Global's actual card layout, and closes the single biggest,
-- cheapest structural hole: the FIRST account to claim a given ID gets
-- it, and every other account (including the real owner, if they show
-- up later) is blocked with a clear, immediate, investigable conflict -
-- rather than two people quietly sharing one identity indefinitely with
-- nothing to ever surface it.
--
-- Partial index (WHERE global_membership_id IS NOT NULL) rather than a
-- plain UNIQUE column constraint, since:
--  - A profile row can theoretically exist mid-signup before this field
--    is set (defensive - the current sign-up flow always sets it, but
--    the column itself is nullable).
--  - The existing 3rd-confirmed-report scrub (migration 0012's
--    handle_report_confirmed()) sets global_membership_id to NULL on a
--    suspended/scrubbed account specifically so the ID becomes available
--    again for its real owner to later claim - a plain UNIQUE constraint
--    with multiple NULLs already behaves this way in Postgres (NULLs are
--    never considered duplicates of each other), so this is really just
--    being explicit about that intent rather than relying on the default
--    behavior silently.
create unique index profiles_global_membership_id_unique
  on public.profiles (global_membership_id)
  where global_membership_id is not null;

comment on index public.profiles_global_membership_id_unique is
  'Enforces one Steer Me account per real Global Handicap membership ID. '
  'A conflict here means someone is either re-entering their own ID by '
  'mistake, or someone else has already claimed their identity - see '
  'RUNBOOK.md''s "Reviewing a suspected identity/classification conflict" '
  'section for how to investigate.';
