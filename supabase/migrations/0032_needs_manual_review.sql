-- NEW, added 2026-07-27, alongside the verify-classification-card Edge
-- Function. That function extracts and compares a card's name/ID/
-- classification/expiration against what a user claimed - but if the AI
-- provider is unavailable or not yet configured, the function
-- deliberately does NOT block sign-up/classification-update (a temporary
-- outage shouldn't lock everyone out of the app). This column is where
-- that "we couldn't check, so a human should" signal lives instead of
-- being silently lost.
alter table public.profiles
  add column needs_manual_review boolean not null default false;

comment on column public.profiles.needs_manual_review is
  'True when verify-classification-card could not run (AI provider down '
  'or not configured) at the time this profile was created/updated, so '
  'its classification/identity claim was never actually checked against '
  'the uploaded card. See RUNBOOK.md.';
