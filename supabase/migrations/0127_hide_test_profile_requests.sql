-- Partner requests from or to a test/demo/staff profile are hidden from real ropers (Justin, 2026-11-07).
--
-- Migration 0121 hid test profiles, but not the requests they had already sent. Four real members each held a pending
-- request from a test profile: it showed on My Requests as an "Unknown" card, and tapping Accept would have spent one of
-- their 3 free matches on a fake partner. Those four were declined on 2026-11-07; this keeps it from happening again.
--
-- A RESTRICTIVE select policy is ANDed with the existing request policies. visible_to_viewer(x) is true for a normal
-- profile, and for a test profile it is true only when the viewer is also a test profile (reviewer and staff accounts), so
-- reviewers still see a populated app. Only the app's own session is affected: the service role (nightly check, triage
-- scripts) bypasses row security, and nothing is deleted.

drop policy if exists "partner_requests_hide_test_profiles" on public.partner_requests;
create policy "partner_requests_hide_test_profiles" on public.partner_requests
  as restrictive
  for select
  using (public.visible_to_viewer(requester_id) and public.visible_to_viewer(recipient_id));
