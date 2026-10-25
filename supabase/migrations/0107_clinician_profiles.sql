-- Clinicians (Justin, 2026-10-24): instructors who teach roping clinics and schools can sign up through the producer
-- sign-up and post their own clinics. They use the same producer profile and verification flow (their events stay
-- visible only to them until a profile is verified), flagged with is_clinician. Anything a clinician posts is a clinic
-- (listed only under "Clinics & schools"), and an ordinary producer's events can never be filed as clinics.

alter table public.producer_profiles
  add column is_clinician boolean not null default false;

-- Replace (not overload) so named-argument RPC calls stay unambiguous. Same body as 0062 plus is_clinician.
drop function public.create_producer_profile(text, text, text, text, text, uuid);

create or replace function public.create_producer_profile(
  p_org_name text,
  p_contact_name text,
  p_contact_info text,
  p_affiliation text,
  p_verification_doc_path text,
  p_claim_identity_id uuid default null,
  p_is_clinician boolean default false
)
returns public.producer_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.producer_profiles;
  target_identity_id uuid;
begin
  insert into public.producer_profiles (id, org_name, contact_name, contact_info, affiliation, verification_doc_path, is_clinician)
  values (auth.uid(), p_org_name, p_contact_name, p_contact_info, p_affiliation, p_verification_doc_path, coalesce(p_is_clinician, false))
  returning * into result;

  if p_claim_identity_id is not null then
    update public.producer_identities
    set claimed_by = auth.uid()
    where id = p_claim_identity_id and claimed_by is null
    returning id into target_identity_id;
  end if;

  if target_identity_id is null then
    insert into public.producer_identities (org_name, claimed_by)
    values (p_org_name, auth.uid())
    returning id into target_identity_id;
  end if;

  return result;
end;
$$;

grant execute on function public.create_producer_profile(text, text, text, text, text, uuid, boolean) to authenticated;

-- The kind of an event follows the kind of the profile that posts it, whatever the client sends: a clinician's events
-- are always clinics (with the one-placeholder divisions array), a producer's never are. Admin-posted events
-- (producer_id null) keep whatever the admin chose.
create or replace function public.force_event_clinic_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clinician boolean;
begin
  if new.producer_id is null then
    return new;
  end if;
  select is_clinician into clinician from public.producer_profiles where id = new.producer_id;
  if clinician is null then
    return new;
  end if;
  new.is_clinic := clinician;
  if clinician and (new.divisions is null or coalesce(array_length(new.divisions, 1), 0) = 0) then
    new.divisions := array[19]::numeric(3,1)[];
  end if;
  return new;
end;
$$;

create trigger events_force_clinic_kind
  before insert or update of producer_id, is_clinic on public.events
  for each row execute function public.force_event_clinic_kind();
