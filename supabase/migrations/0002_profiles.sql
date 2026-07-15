-- Athlete profiles. This is the most sensitive table in the schema: contact
-- info, the Global membership ID, and the verification screenshot path must
-- never be readable by any other user. That is enforced structurally by
-- keeping this table locked to owner-only SELECT and only ever exposing a
-- restricted set of columns to other users through the public_profiles view
-- (migration 0004) and the get_request_contact() RPC (migration 0010).
--
-- global_classification and verification_screenshot_path are required at
-- sign-up by the app itself (client-side validation), but are left nullable
-- here rather than NOT NULL, because the 3rd-confirmed-report scrub path
-- (migration 0012) needs to null them out later without violating a
-- constraint that only made sense at creation time.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  is_minor boolean not null default false,
  guardian_name text,
  guardian_contact text,
  "position" text not null check ("position" in ('Header', 'Heeler')),
  home_area text not null,
  contact text,
  avatar_url text,
  global_membership_id text,
  global_classification numeric(3,1),
  verification_screenshot_path text,
  guidelines_accepted_at timestamptz not null default now(),
  guardian_consent_at timestamptz,
  suspended boolean not null default false,
  suspended_reason text,
  scrubbed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Athlete profiles. contact, guardian_contact, global_membership_id, and '
  'verification_screenshot_path must never be exposed to other users - see '
  'public_profiles and get_request_contact().';

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Self-service "Delete my profile & data": the client removes the storage
-- screenshot/avatar objects it owns, then deletes this row directly - no
-- Edge Function needed for the common case. This intentionally does NOT
-- delete auth.users or a separate producer_profiles row, matching the
-- Privacy Policy's distinction between deleting an athlete profile and
-- deleting the whole account/login.
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER because callers need to check ANOTHER user's suspended
-- flag (e.g. "is the recipient of my request suspended?") which the base
-- table's owner-only RLS would otherwise block entirely.
create or replace function public.is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select suspended from public.profiles where id = uid), false);
$$;
