-- Producer identity claims were first-come: anyone creating a producer profile could claim any unclaimed producer identity
-- (a real producer's name and rating history) at sign-up, post events under that reputation, and block the real producer from
-- ever claiming it. A claim now only carries weight once staff verify the profile: events link to the claimed identity only for
-- a verified profile, and verifying a profile links its earlier events. Staff see the claimed identity in the nightly check and
-- can release a wrong claim (RUNBOOK).
create or replace function public.set_event_producer_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.producer_id is not null and new.producer_identity_id is null
     and exists (select 1 from public.producer_profiles where id = new.producer_id and verification_status = 'verified') then
    select id into new.producer_identity_id
    from public.producer_identities
    where claimed_by = new.producer_id;
  end if;
  return new;
end;
$$;

create or replace function public.link_events_on_producer_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    update public.events e
    set producer_identity_id = (select id from public.producer_identities where claimed_by = new.id)
    where e.producer_id = new.id and e.producer_identity_id is null
      and exists (select 1 from public.producer_identities where claimed_by = new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.link_events_on_producer_verified() from public, anon, authenticated;

drop trigger if exists producer_profiles_link_events_on_verified on public.producer_profiles;
create trigger producer_profiles_link_events_on_verified
  after update of verification_status on public.producer_profiles
  for each row execute function public.link_events_on_producer_verified();
