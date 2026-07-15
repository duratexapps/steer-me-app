-- Partner requests. Posting a need / sending a request is a subscription
-- feature per the Pricing & Fees doc, enforced in the insert policy below
-- (not just client-side), alongside block checks and a suspended-user check
-- on both parties.

create table public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  division numeric(3,1) not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'pending_guardian', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_request check (requester_id <> recipient_id)
);

-- A plain UNIQUE(...) constraint would NOT dedupe rows where event_id is
-- NULL (the non-event Post-a-Need flow), because Postgres treats every NULL
-- as distinct from every other NULL in a unique constraint. Coalescing to a
-- sentinel UUID in an expression index closes that gap so "already
-- requested" dedup actually works for both event-scoped and generic
-- requests.
create unique index partner_requests_unique_key
  on public.partner_requests (
    requester_id,
    recipient_id,
    division,
    coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.partner_requests enable row level security;

create policy "partner_requests_select_party" on public.partner_requests
  for select using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy "partner_requests_insert_requester" on public.partner_requests
  for insert with check (
    requester_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and not public.is_suspended(recipient_id)
    and not public.is_blocked_pair(auth.uid(), recipient_id)
    and public.has_active_subscription(auth.uid())
  );

-- Only the recipient can respond, and only to accept or decline - never
-- reopen or re-request through an update.
create policy "partner_requests_update_recipient" on public.partner_requests
  for update using (auth.uid() = recipient_id)
  with check (
    auth.uid() = recipient_id
    and status in ('accepted', 'declined')
  );

-- The initial status is always computed server-side from the recipient's
-- is_minor flag - never trusted from client input. This is the "guardian
-- approval" routing: since minors sign up with guardian consent captured at
-- profile creation and there's no separate guardian login in v1, the
-- guardian is modeled as the person operating the minor's account, and
-- 'pending_guardian' is what the Received-requests UI uses to label the
-- request for guardian review.
create or replace function public.set_request_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select is_minor from public.profiles where id = new.recipient_id) then
    new.status := 'pending_guardian';
  else
    new.status := 'pending';
  end if;
  new.responded_at := null;
  return new;
end;
$$;

create trigger partner_requests_set_initial_status
  before insert on public.partner_requests
  for each row execute function public.set_request_initial_status();

create or replace function public.stamp_request_response()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger partner_requests_stamp_response
  before update on public.partner_requests
  for each row execute function public.stamp_request_response();

-- The only code path in the entire schema that can return a minor's
-- guardian_contact or an adult's contact to the OTHER party in a request -
-- and only once that request is accepted. This is what "tap to contact"
-- calls after a request flips to accepted.
create or replace function public.get_request_contact(request_id uuid)
returns table (contact text, is_guardian boolean, guardian_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req record;
  other_id uuid;
begin
  select * into req from public.partner_requests where id = request_id;

  if req is null then
    raise exception 'Request not found';
  end if;

  if req.status <> 'accepted' then
    raise exception 'Contact info is only available after the request is accepted';
  end if;

  if auth.uid() <> req.requester_id and auth.uid() <> req.recipient_id then
    raise exception 'Not authorized for this request';
  end if;

  other_id := case when auth.uid() = req.requester_id then req.recipient_id else req.requester_id end;

  return query
    select
      case when p.is_minor then p.guardian_contact else p.contact end as contact,
      p.is_minor as is_guardian,
      case when p.is_minor then p.guardian_name else null end as guardian_name
    from public.profiles p
    where p.id = other_id;
end;
$$;

grant execute on function public.get_request_contact(uuid) to authenticated;
