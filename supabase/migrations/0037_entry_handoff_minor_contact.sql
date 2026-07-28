-- Real gap caught during testing of 0036 (immediately after, same
-- session): a minor's profile has contact = null (guardian_contact is
-- used instead, same convention as get_request_contact() in migration
-- 0010) - create_entry_handoff() read `contact` directly for both
-- parties, so a minor entrant (or a minor's confirmed partner) would
-- silently get a blank contact field prefilled instead of their
-- guardian's, even though the data needed to do this correctly already
-- exists. Two of the 20 demo athletes added this same day are minors
-- specifically so this case has real test data to catch against - this
-- is that catch.
create or replace function public.create_entry_handoff(
  p_event_id uuid,
  p_partner_request_id uuid default null,
  p_me_role text default null,
  p_partner_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  partner public.profiles;
  req public.partner_requests;
  partner_id uuid;
  handoff_id uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me is null then
    raise exception 'Profile not found';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  if p_partner_request_id is not null then
    select * into req from public.partner_requests where id = p_partner_request_id;
    if req is null then
      raise exception 'Request not found';
    end if;
    if req.status <> 'accepted' then
      raise exception 'Request is not accepted';
    end if;
    if auth.uid() <> req.requester_id and auth.uid() <> req.recipient_id then
      raise exception 'Not authorized for this request';
    end if;
    if req.event_id is distinct from p_event_id then
      raise exception 'Request does not match this event';
    end if;
    if p_me_role is null or p_partner_role is null
       or p_me_role not in ('header', 'heeler') or p_partner_role not in ('header', 'heeler')
       or p_me_role = p_partner_role then
      raise exception 'Invalid role assignment';
    end if;

    partner_id := case when auth.uid() = req.requester_id then req.recipient_id else req.requester_id end;
    select * into partner from public.profiles where id = partner_id;
    if partner is null then
      raise exception 'Partner profile not found';
    end if;
  end if;

  insert into public.entry_handoffs (
    event_id, created_by,
    me_first_name, me_last_name, me_classification, me_global_membership_id, me_contact, me_role,
    partner_first_name, partner_last_name, partner_classification, partner_global_membership_id, partner_contact, partner_role
  ) values (
    p_event_id, auth.uid(),
    split_part(me.full_name, ' ', 1),
    coalesce(nullif(substr(me.full_name, length(split_part(me.full_name, ' ', 1)) + 2), ''), ''),
    case
      when p_me_role is null then me.global_classification
      when p_me_role = 'header' then coalesce(me.global_classification, me.header_classification)
      else coalesce(me.global_classification, me.heeler_classification)
    end,
    me.global_membership_id,
    -- FIXED here (see this migration's own header comment): fall back to
    -- guardian_contact for a minor, same as get_request_contact() does.
    coalesce(me.contact, me.guardian_contact),
    p_me_role,
    case when partner.id is not null then split_part(partner.full_name, ' ', 1) else null end,
    case when partner.id is not null
      then coalesce(nullif(substr(partner.full_name, length(split_part(partner.full_name, ' ', 1)) + 2), ''), '')
      else null end,
    case
      when partner.id is null then null
      when p_partner_role = 'header' then coalesce(partner.global_classification, partner.header_classification)
      else coalesce(partner.global_classification, partner.heeler_classification)
    end,
    partner.global_membership_id,
    coalesce(partner.contact, partner.guardian_contact),
    p_partner_role
  )
  returning id into handoff_id;

  return handoff_id;
end;
$$;
