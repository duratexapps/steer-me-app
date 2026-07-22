-- Aligns issue_reports.status vocabulary with the Wix-side IssueReports
-- collection's existing new/triaged/resolved convention (matching
-- ropingtools-site's Feedback collection), so the evening triage routine
-- reasons about both data sources the same way. Table is brand new and
-- empty, so this is a plain constraint/default swap, not a backfill.

alter table public.issue_reports
  drop constraint issue_reports_status_check;

alter table public.issue_reports
  alter column status set default 'new';

alter table public.issue_reports
  add constraint issue_reports_status_check check (status in ('new', 'triaged', 'resolved'));

-- 'resolved' is a manual step (Justin flips it after actually sending the
-- reply) - mirrors "set manually from the Content Manager" already
-- documented for Wix's Feedback collection.
comment on column public.issue_reports.status is
  'new: unreviewed. triaged: draft_reply prepared, awaiting send. resolved: reply actually sent - set manually, nothing automated flips this.';
