-- NEW, added 2026-09-29 - real gap found during live testing: the user
-- deliberately tried to sign up an associate's test account using his own
-- real Global Handicap ID (against his test1@steerme.test account) to
-- verify report-membership-conflict actually works. It did - the insert
-- was correctly blocked and a membership_id_conflicts row was written -
-- but he had no way to tell whether the "we've let the account holder
-- know" email in the blocked-attempt copy was actually true, since
-- test1@steerme.test isn't a real inbox he can check. Turned out it
-- wasn't knowable either way: the Edge Function's `notified` return value
-- was never persisted anywhere, only returned to the (fire-and-forget,
-- ignored) client call in sign-up.tsx/verification.ts. A real user whose
-- email is wrong or bounces would hit the exact same silent gap - nobody,
-- not the reviewer working the pending_review queue and not the account
-- holder, would ever know the notification didn't land.
--
-- Tracks each recipient independently (not one combined boolean) since a
-- send to one party can succeed while the other fails - e.g. the existing
-- holder's email bounces but the blocked person's goes through fine.
-- Three-state, not boolean: null means "never attempted" (no
-- RESEND_API_KEY configured yet, or that party had no email on file to
-- send to at all) - a meaningfully different case from "attempted and
-- Resend rejected it," which is what `false` now means.
alter table public.membership_id_conflicts
  add column existing_holder_notified boolean,
  add column blocked_attempt_notified boolean,
  add column notification_error text;

comment on column public.membership_id_conflicts.existing_holder_notified is
  'null = never attempted (no RESEND_API_KEY set yet, or no email on file for this account). true = Resend accepted the send. false = Resend rejected/threw - see notification_error.';
comment on column public.membership_id_conflicts.blocked_attempt_notified is
  'Same three-state meaning as existing_holder_notified, for the person who got blocked rather than the existing account holder.';
comment on column public.membership_id_conflicts.notification_error is
  'Raw error detail from whichever send(s) failed, for whoever is reviewing pending_review rows - null when both sends succeeded (or were never attempted).';
