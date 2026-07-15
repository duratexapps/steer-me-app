-- Producer profiles are a separate business/organizational presence from an
-- athlete profile, per the Privacy Policy - deleting an athlete profile must
-- never cascade into deleting this. There is deliberately no client-side
-- DELETE policy: removing a producer profile is a manual support request
-- (documented in supabase/RUNBOOK.md), not a self-service action, matching
-- "Contact us to remove a producer profile" in the Privacy Policy.

create table public.producer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_name text not null,
  contact_name text,
  contact_info text,
  affiliation text,
  verification_doc_path text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.producer_profiles enable row level security;

create policy "producer_profiles_select_own" on public.producer_profiles
  for select using (auth.uid() = id);

create policy "producer_profiles_insert_own" on public.producer_profiles
  for insert with check (auth.uid() = id);

create policy "producer_profiles_update_own" on public.producer_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create trigger producer_profiles_set_updated_at
  before update on public.producer_profiles
  for each row execute function public.set_updated_at();
