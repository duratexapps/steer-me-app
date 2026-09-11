-- NEW, added 2026-08-18 - closes a real gap the user flagged directly:
-- migration 0031's unique constraint on global_membership_id stops two
-- accounts from sharing one ID going forward, but nothing ever told
-- either party a conflict happened. The blocked signup just saw
-- friendlySupabaseError()'s "contact support" toast and, unless they
-- actually emailed in, the attempt vanished - the legitimate account
-- holder never found out someone tried to claim their identity, and the
-- RUNBOOK's own "Reviewing a suspected identity/classification conflict"
-- section only ever got read reactively, after a support email arrived.
-- This migration adds the queue that makes it proactive instead.
--
-- Part 1: fix a real matching bug found while designing this. The unique
-- index added by migration 0031 sits on the raw, only-trimmed
-- global_membership_id column (see sign-up.tsx/update-classification.tsx
-- - both only call .trim() before insert/update). verify-classification-
-- card's own normalizeId() uppercases and strips punctuation before
-- comparing claimed-vs-photo, but that normalization never touched the
-- stored value or the uniqueness check. So "AB-123", "ab123", and
-- "AB123 " would each pass as three DIFFERENT values today, even though
-- they're the same real ID - a gap in the exact protection 0031 was
-- built to close. Fixed via a generated column rather than normalizing
-- the stored value itself, so a user's ID still displays exactly as they
-- typed it (matching their real card) while the uniqueness/lookup logic
-- operates on the canonical form.
alter table public.profiles
  add column global_membership_id_normalized text
  generated always as (
    case when global_membership_id is null then null
    else upper(regexp_replace(global_membership_id, '[^a-zA-Z0-9]', '', 'g'))
    end
  ) stored;

drop index if exists public.profiles_global_membership_id_unique;

create unique index profiles_global_membership_id_normalized_unique
  on public.profiles (global_membership_id_normalized)
  where global_membership_id_normalized is not null and global_membership_id_normalized <> '';

comment on index public.profiles_global_membership_id_normalized_unique is
  'Enforces one Steer Me account per real Global Handicap membership ID, '
  'matched on a normalized (uppercased, punctuation-stripped) form so '
  'formatting differences like "AB-123" vs "ab123" can''t both claim the '
  'same real ID. See report-membership-conflict Edge Function for what '
  'happens the moment this constraint blocks a signup/update.';

-- Part 2: the actual conflict queue. One row per blocked attempt, written
-- by the report-membership-conflict Edge Function (called by the client
-- right when sign-up.tsx/update-classification.tsx's insert/update hits
-- this unique constraint) - not by a database trigger, since the
-- attempting person's insert/update never succeeds in the first place,
-- so there's no row-level event to hang a trigger off of. The Edge
-- Function is also where both notification emails go out (see that
-- function's own header comment).
create table public.membership_id_conflicts (
  id uuid primary key default gen_random_uuid(),
  membership_id_normalized text not null,
  -- The account that currently holds the ID. on delete set null (not
  -- cascade) so this row - real evidence of a fraud attempt - survives
  -- even if that profile later gets suspended/scrubbed by the resolution
  -- itself (see handle_report_confirmed() in migration 0012 for the same
  -- scrub shape this gets resolved with).
  existing_profile_id uuid references public.profiles(id) on delete set null,
  -- The blocked person's own auth account. They never got a profiles row
  -- (the insert failed before that), so this points at auth.users
  -- directly, same as profiles.id itself does. on delete set null so the
  -- row survives account deletion too.
  attempted_by_user_id uuid references auth.users(id) on delete set null,
  attempted_name text not null,
  attempted_position text not null,
  attempted_screenshot_path text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'dismissed', 'resolved_existing_was_fraud', 'resolved_new_was_fraud')),
  resolved_at timestamptz,
  resolved_note text,
  created_at timestamptz not null default now()
);

create index membership_id_conflicts_status_idx
  on public.membership_id_conflicts (status, created_at);

create index membership_id_conflicts_membership_id_idx
  on public.membership_id_conflicts (membership_id_normalized);

alter table public.membership_id_conflicts enable row level security;
-- No client policies - written only by report-membership-conflict via the
-- service-role admin client, reviewed only via Supabase Studio, same
-- service-role-only convention as rate_limit_hits (migration 0055).
