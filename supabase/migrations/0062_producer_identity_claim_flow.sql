-- Closes the loop on producer_identities (migration 0061): a real producer
-- signing up needs a way to (a) find and claim an existing identity built
-- from their own past flier-posted events, or (b) get a fresh one if
-- they're new, and every event they create from here on needs to keep
-- rolling into that same identity automatically - none of that existed
-- yet, so 0061's reputation only ever worked for backfilled history.

-- Search source for the sign-up "is this you?" step and, later, a producer
-- browse/filter. One row per identity with its published-event count and
-- rating baked in, so the client doesn't need a second round-trip per
-- candidate shown.
create view public.producer_identity_directory
with (security_invoker = false) as
select
  pi.id,
  pi.org_name,
  pi.is_sanctioning_body,
  pi.claimed_by,
  count(e.id) filter (where e.status = 'published') as event_count,
  case when count(r.*) >= 3 then round(avg(r.stars)::numeric, 1) else null end as avg_stars,
  count(r.*) as rating_count
from public.producer_identities pi
left join public.events e on e.producer_identity_id = pi.id
left join public.event_ratings r on r.event_id = e.id
group by pi.id;

grant select on public.producer_identity_directory to authenticated;

-- Replaces the plain `insert into producer_profiles` ProducerSignUp used to
-- do directly. Needs to be one atomic RPC, not a client insert followed by
-- a separate claim_producer_identity() call: a producer_profiles row and
-- its identity have to come into existence together in the same
-- transaction, or a naive "auto-create an identity whenever a new producer
-- profile appears" trigger would race the client's own follow-up claim
-- call and create a spare, orphaned identity before the real claim could
-- land - claimed_by's unique constraint would then reject the real claim
-- outright.
--
-- p_claim_identity_id is the one the client's own search step suggested
-- and the producer confirmed is them ("is this you?"); null means either
-- no match was found or they said no, in which case a brand new identity
-- is created and immediately self-claimed - every producer_profiles row
-- ends up with exactly one producer_identities row from the moment it
-- exists, with no separate manual step required.
create or replace function public.create_producer_profile(
  p_org_name text,
  p_contact_name text,
  p_contact_info text,
  p_affiliation text,
  p_verification_doc_path text,
  p_claim_identity_id uuid default null
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
  insert into public.producer_profiles (id, org_name, contact_name, contact_info, affiliation, verification_doc_path)
  values (auth.uid(), p_org_name, p_contact_name, p_contact_info, p_affiliation, p_verification_doc_path)
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

grant execute on function public.create_producer_profile(text, text, text, text, text, uuid) to authenticated;

-- Every event a claimed producer creates from now on rolls into their one
-- identity automatically - no create-event.tsx change needed. Admin-posted
-- events are untouched (producer_id is null for those; they keep being
-- attributed by whoever posts them, per 0061's backfill convention).
create or replace function public.set_event_producer_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.producer_id is not null and new.producer_identity_id is null then
    select id into new.producer_identity_id
    from public.producer_identities
    where claimed_by = new.producer_id;
  end if;
  return new;
end;
$$;

create trigger events_set_producer_identity
  before insert on public.events
  for each row execute function public.set_event_producer_identity();
