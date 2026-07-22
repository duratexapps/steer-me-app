-- "Report an Issue" - a bug/problem report about the app itself, distinct
-- from event_reports/user_reports (migration 0012), which are content-
-- moderation reports about other people's conduct or listings. Keyed to
-- auth.users directly, not public.profiles or producer_profiles - a
-- reporter might not have completed either profile yet (mid-onboarding),
-- and filing a bug report should never be blocked on that.
--
-- Triage happens outside the app (an AI/human review pass reading this
-- table directly, per the evening check-in routine), so there's
-- deliberately no update/delete policy for the reporter - status,
-- resolution_type, draft_reply, and triage_note are filled in by that
-- process, not the client. Nothing here ever auto-emails the reporter;
-- draft_reply just sits here until a human decides to send it.

create table public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Populated by the client only when neither profiles.full_name nor
  -- producer_profiles.contact_name resolves for this user - the "if their
  -- user ID doesn't give us a name" fallback the reporter types in by hand.
  reporter_name_override text,
  role text not null check (role in ('contestant', 'producer')),
  description text not null,
  screenshot_path text,
  -- Free text: which screen/URL the reporter was on. Native passes a route
  -- name, web can pass the actual URL - either way it's just context for
  -- triage, not something queried against.
  page_context text,
  status text not null default 'open' check (status in ('open', 'triaged')),
  resolution_type text check (resolution_type in ('fixed', 'clarified', 'escalated')),
  -- What actually gets sent to the reporter, once a human approves it -
  -- never sent automatically by anything that writes this column.
  draft_reply text,
  -- Internal note for Justin, e.g. "fixed in commit abc123" or "3rd report
  -- about the same flow - worth discussing before touching code."
  triage_note text,
  created_at timestamptz not null default now(),
  triaged_at timestamptz
);

alter table public.issue_reports enable row level security;

create policy "issue_reports_select_own" on public.issue_reports
  for select using (auth.uid() = reporter_id);

create policy "issue_reports_insert_own" on public.issue_reports
  for insert with check (auth.uid() = reporter_id);

-- Screenshot storage: never public (could show anything on screen at the
-- time), owner-only, same {user_id}/filename convention as every other
-- bucket in 0013_storage.sql.
insert into storage.buckets (id, name, public)
values ('issue-screenshots', 'issue-screenshots', false)
on conflict (id) do nothing;

create policy "issue_screenshots_owner_all"
on storage.objects for all
using (bucket_id = 'issue-screenshots' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'issue-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
