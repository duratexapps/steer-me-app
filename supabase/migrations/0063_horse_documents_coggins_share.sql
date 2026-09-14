-- Real gap flagged directly by the user: many fliers require a negative
-- Coggins (EIA test) on hand at check-in, and a roper who gets asked for
-- it at the gate sometimes has to go dig it out of the trailer. This lets
-- a roper keep it on their phone (per-horse, since someone hauling
-- multiple horses needs one document per horse, not one per person) and
-- share it at the gate via a short-lived link/QR code that needs no
-- producer account or login to view.

create table public.horse_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  horse_name text not null,
  -- Color/markings, matching how a physical Coggins form itself usually
  -- carries a description for visual matching against the actual horse -
  -- optional since the document photo alone may already be enough.
  description text,
  document_path text not null,
  test_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.horse_documents is
  'A roper''s own Coggins (EIA test) documents, one row per horse. Private, '
  'owner-only - the only way anyone else ever sees one is the short-lived '
  'share flow in coggins_shares below, never direct table/storage access.';

create trigger horse_documents_set_updated_at
  before update on public.horse_documents
  for each row execute function public.set_updated_at();

alter table public.horse_documents enable row level security;

create policy "horse_documents_owner_all" on public.horse_documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('coggins-documents', 'coggins-documents', false)
on conflict (id) do nothing;

-- Same owner-only-in-every-direction shape as verification-screenshots
-- (migration 0013) - never public, path convention {user_id}/filename.
create policy "coggins_documents_owner_all"
on storage.objects for all
using (bucket_id = 'coggins-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'coggins-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- The "show at the gate" share token. Deliberately carries nothing but an
-- opaque id - no horse info, no name, nothing meaningful if it leaked or
-- got logged somewhere, same reasoning entry_handoffs (migration 0036)
-- gives for keeping real personal data out of a URL entirely. A stranger
-- resolving this has no Supabase session at all, so revealing the actual
-- documents happens through the get-coggins-share Edge Function
-- (service role, bypasses RLS) - never a direct client select against this
-- table or the bucket above, which is why there's no select policy here.
create table public.coggins_shares (
  token text primary key default gen_random_uuid()::text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.coggins_shares is
  'Short-lived, regenerate-every-time share tokens for the "show at the '
  'gate" QR flow - see get-coggins-share Edge Function. expires_at is '
  'always server-forced to 30 minutes from creation (see '
  'force_coggins_share_expiry trigger) regardless of what a client sends, '
  'so a modified client can''t mint a long-lived or permanent link.';

create or replace function public.force_coggins_share_expiry()
returns trigger
language plpgsql
as $$
begin
  new.expires_at := now() + interval '30 minutes';
  return new;
end;
$$;

create trigger coggins_shares_force_expiry
  before insert on public.coggins_shares
  for each row execute function public.force_coggins_share_expiry();

alter table public.coggins_shares enable row level security;

-- Owner can mint their own share tokens; deliberately no select/update/
-- delete policy - the app never needs to list or manage past tokens, only
-- create a fresh one each time "Show at the gate" is tapped (see the
-- table comment on why regenerating, not reusing, is the point).
create policy "coggins_shares_owner_insert" on public.coggins_shares
  for insert with check (owner_id = auth.uid());
