-- Real gap flagged directly by the user: an entrant who found their
-- Steer Me profile info AND a confirmed Steer Me partner still has to
-- manually retype everything (name, classification, Global ID, contact -
-- for BOTH people if a partner's confirmed) on Draw Pro's Entrant Entry
-- page, since that page has never known anything about Steer Me beyond
-- the one-directional event sync (migration 0029). Real friction, real
-- risk of losing users at exactly the moment they're ready to commit.
--
-- Deliberately NOT solved by stuffing name/email/phone/classification
-- into the "Enter the Draw" URL's query string - that's a real privacy
-- anti-pattern (query strings end up in browser history, some server/
-- proxy logs, and Referer headers of any third-party resource the
-- landing page loads). Instead: a short-lived, single-use handoff row
-- created server-side (via create_entry_handoff() below, SECURITY
-- DEFINER so it can independently verify a caller's right to a partner's
-- data rather than trusting whatever a client claims), referenced by
-- nothing but its own opaque id in the URL. Draw Pro's entrant-entry-
-- form.js fetches it exactly once via a server-to-server call using the
-- same steerme-supabase-url / steerme-supabase-service-role-key secrets
-- already used by steerMeSync.jsw (the reverse direction), then marks it
-- consumed - see backend/steerMeHandoff.jsw in ropingtools-site.
create table public.entry_handoffs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,

  me_first_name text not null,
  me_last_name text not null,
  me_classification numeric(3,1),
  me_global_membership_id text,
  me_contact text,
  -- 'header' | 'heeler' | null - null for the solo/no-confirmed-partner
  -- case (see create_entry_handoff()'s p_partner_request_id = null
  -- branch), where prefilling a role would just be a guess Draw Pro's
  -- own #radioRole/#radioDrawInRole selection is better placed to make.
  me_role text check (me_role in ('header', 'heeler')),

  -- All null together when there's no confirmed partner yet - this is
  -- what entrant-entry-form.js checks to decide whether to pre-check
  -- "I already have a partner" at all.
  partner_first_name text,
  partner_last_name text,
  partner_classification numeric(3,1),
  partner_global_membership_id text,
  partner_contact text,
  partner_role text check (partner_role in ('header', 'heeler')),

  created_at timestamptz not null default now(),
  -- Single-use and short-lived on purpose - this snapshot briefly carries
  -- another real person's name/classification/contact info (the partner
  -- fields), so it shouldn't sit around indefinitely re-fetchable. 1 hour
  -- comfortably covers "tap Enter the Draw, actually load the page,"
  -- with no realistic legitimate reason to reuse the same link later.
  expires_at timestamptz not null default (now() + interval '1 hour'),
  consumed_at timestamptz,

  constraint entry_handoff_partner_fields_together check (
    (partner_first_name is null and partner_role is null)
    or (partner_first_name is not null and partner_role is not null)
  )
);

comment on table public.entry_handoffs is
  'Short-lived, single-use snapshots handing Steer Me profile data (and, '
  'if a partner request is already accepted for this event, the '
  'partner''s data too) into Draw Pro''s Entrant Entry page, so a '
  'confirmed Steer Me user/pair doesn''t have to retype what''s already '
  'known. Read exactly once by backend/steerMeHandoff.jsw (Draw Pro '
  'side, via service-role key), which marks it consumed immediately.';

-- No public SELECT/INSERT policy at all - every access goes through
-- these two SECURITY DEFINER paths instead:
--  - create_entry_handoff() (below) for the Steer Me app to create one
--    for itself, with server-verified data (never trusting client-
--    supplied partner info).
--  - Draw Pro's service-role key for the one-time read + consume, which
--    bypasses RLS entirely by design (same pattern as steerMeSync.jsw's
--    own writes into public.events).
alter table public.entry_handoffs enable row level security;

-- Row-level defense in depth even though the intended read path is the
-- service-role key: if RLS were ever bypassed some other way, this at
-- least confines a caller to their own created rows, not the whole table.
create policy "entry_handoffs_select_own" on public.entry_handoffs
  for select using (auth.uid() = created_by);

-- The person opening this event's "Enter the Draw" link.
--   p_partner_request_id null -> solo prefill, no partner section.
--   p_partner_request_id set -> must be an ACCEPTED request the caller
--     is a party to, scoped to this same event; p_me_role/p_partner_role
--     ('header'/'heeler', must differ) come from the client's own
--     canPair()-derived role assignment for this specific pairing +
--     division (see resolvePairingRoles() in src/lib/matching.ts) -
--     trusted for role only, since a wrong role assignment here is just
--     a prefill the entrant can correct on Draw Pro's own form, not a
--     security boundary. The partner's actual NAME/CLASSIFICATION/
--     GLOBAL ID/CONTACT are never trusted from the client - always
--     re-fetched here from their own profile row, gated on the caller
--     actually being the other party to an accepted request naming them.
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
    me.contact,
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
    partner.contact,
    p_partner_role
  )
  returning id into handoff_id;

  return handoff_id;
end;
$$;

grant execute on function public.create_entry_handoff(uuid, uuid, text, text) to authenticated;
