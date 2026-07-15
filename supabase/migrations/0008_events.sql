-- Event listings. New events default to 'pending_review' and stay out of
-- public Browse/Events until either the producer is already verified at
-- insert time (auto-published below) or an admin manually flips status to
-- 'published' via Supabase Studio (see supabase/RUNBOOK.md) - there is no
-- admin app in v1, this is a documented manual step.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producer_profiles(id) on delete cascade,
  name text not null,
  event_date date not null,
  location text not null,
  entry_fee text,
  description text,
  divisions numeric(3,1)[] not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'published', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- array_length() returns NULL (not 0) for an empty array, and a CHECK
  -- constraint treats a NULL result as passing - so the naive
  -- "array_length(divisions, 1) > 0" would let an empty array through.
  -- coalesce(...,0) closes that gap.
  constraint at_least_one_division check (coalesce(array_length(divisions, 1), 0) > 0)
);

alter table public.events enable row level security;

create policy "events_select_published_or_own" on public.events
  for select using (status = 'published' or producer_id = auth.uid());

create policy "events_insert_own" on public.events
  for insert with check (producer_id = auth.uid());

create policy "events_update_own" on public.events
  for update using (producer_id = auth.uid()) with check (producer_id = auth.uid());

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create or replace function public.auto_publish_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.producer_profiles
    where id = new.producer_id and verification_status = 'verified'
  ) then
    new.status := 'published';
  end if;
  return new;
end;
$$;

create trigger events_auto_publish
  before insert on public.events
  for each row execute function public.auto_publish_event();
