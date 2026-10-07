-- Two related changes to public.profiles:
--
-- 1. SECURITY FIX. profiles_update_own / profiles_insert_own let a signed-in
--    user write ANY column of their own row through the public API, which
--    meant a user could set their own is_admin = true (admin event
--    posting/editing, see 0038), clear their own suspended flag, hide or
--    unhide themselves, or fake referral_reward_granted_at. Confirmed
--    2026-10-06 with a throwaway account. This adds a guard trigger so those
--    columns can only be changed by something other than a direct app/API
--    request: the dashboard SQL editor, service-role scripts, or SECURITY
--    DEFINER functions (the auto-suspension triggers in 0012 are definers, so
--    they keep working - checked before writing this). Columns the app
--    legitimately writes itself (needs_manual_review, membership_expiration_
--    date, etc.) are deliberately NOT guarded; see the note at the bottom.
--
-- 2. fix_note. A short admin-written message shown to a user in the app
--    ("Please re-upload your Global Handicap card..."), plus a push if they
--    have notifications on. Only admins (dashboard / scripts) can set it; the
--    user can only clear it, which update-classification does on success.

alter table public.profiles
  add column fix_note text,
  add column fix_note_at timestamptz;

comment on column public.profiles.fix_note is
  'Admin-written note shown to this user in the app (banner on Home/Browse) telling them what to fix. Set from the dashboard or a script; users can only clear it.';
comment on column public.profiles.fix_note_at is
  'When fix_note was last set. Used to spot notes that have sat unanswered.';

create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
as $$
begin
  -- Only direct app/API requests run as role "authenticated". Service-role
  -- scripts, the SQL editor, and SECURITY DEFINER functions run as a
  -- different current_user and are intentionally unrestricted.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin or new.suspended or new.scrubbed or new.hidden_from_matching
       or new.suspended_reason is not null
       or new.referral_reward_granted_at is not null
       or new.fix_note is not null then
      raise exception 'Not allowed to set protected profile fields' using errcode = '42501';
    end if;
  else
    if new.is_admin is distinct from old.is_admin
       or new.suspended is distinct from old.suspended
       or new.scrubbed is distinct from old.scrubbed
       or new.hidden_from_matching is distinct from old.hidden_from_matching
       or new.suspended_reason is distinct from old.suspended_reason
       or new.referral_reward_granted_at is distinct from old.referral_reward_granted_at
       -- a user may clear their fix note, never write one
       or (new.fix_note is distinct from old.fix_note and new.fix_note is not null) then
      raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_protected_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_protected_columns();

create or replace function public.set_profile_fix_note_at()
returns trigger
language plpgsql
as $$
begin
  if new.fix_note is null then
    new.fix_note_at := null;
  elsif tg_op = 'INSERT' or new.fix_note is distinct from old.fix_note then
    new.fix_note_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_set_fix_note_at
  before insert or update of fix_note on public.profiles
  for each row execute function public.set_profile_fix_note_at();

create or replace function public.push_profile_fix_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fix_note is not null and new.fix_note is distinct from old.fix_note then
    perform public.send_push_via_edge_function(
      new.id,
      'Action needed on your Steer Me profile',
      left(new.fix_note, 140),
      jsonb_build_object('type', 'profile_fix_note')
    );
  end if;
  return new;
end;
$$;

create trigger profiles_push_fix_note
  after update of fix_note on public.profiles
  for each row execute function public.push_profile_fix_note();

-- Known limitation, not changed here: needs_manual_review and the card
-- verification result are written by the client itself after it calls
-- verify-classification-card, so a tampered client could skip verification.
-- Closing that means moving the profile write behind a server function.
