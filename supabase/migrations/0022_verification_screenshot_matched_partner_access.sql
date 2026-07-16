-- Fraud-prevention change per user request: since the Global Handicap card
-- shows only Member ID, name, classification, and area (no other PII), a
-- confirmed team partner should be able to see it and visually check it
-- against the claimed classification number - narrower than "open to the
-- platform," but no longer "never shown to anyone." This is keyed to the
-- exact same "accepted request" condition as contact reveal, not a
-- separate trust boundary.
--
-- IMPORTANT: the Privacy Policy reference doc (Section 4) currently states
-- verification screenshots are "never shown to other users" - that
-- document needs a corresponding update before publishing; this migration
-- only changes the app's actual behavior; note flagged to the user
-- separately since editing the legal doc itself wasn't requested.

comment on table public.profiles is
  'Athlete profiles. contact and global_membership_id must never be exposed '
  'to other users - see public_profiles and get_request_contact(). '
  'verification_screenshot_path is exposed only to a confirmed (accepted) '
  'team partner, via get_request_contact() and the matching storage policy '
  'in migration 0022 - never to the wider platform.';

-- Storage: a matched partner can read the OTHER party's card image. Kept
-- as an additional permissive policy alongside the existing owner-only
-- "for all" policy from migration 0013 - Postgres RLS OR's multiple
-- permissive policies together, so this only ever widens read access, it
-- can't narrow the owner's own existing rights.
create policy "verification_screenshots_matched_partner_read"
on storage.objects for select
using (
  bucket_id = 'verification-screenshots'
  and exists (
    select 1 from public.partner_requests pr
    where pr.status = 'accepted'
      and (
        (pr.requester_id = auth.uid() and pr.recipient_id::text = (storage.foldername(name))[1])
        or (pr.recipient_id = auth.uid() and pr.requester_id::text = (storage.foldername(name))[1])
      )
  )
);

-- get_request_contact already reveals contact info only post-acceptance;
-- extending it to also reveal the other party's on-file card path keeps a
-- single source of truth for "when do these protections lift" instead of a
-- second RPC with its own copy of the same eligibility check. Return type
-- is changing, so the function has to be dropped and recreated rather than
-- replaced in place.
drop function public.get_request_contact(uuid);

create function public.get_request_contact(request_id uuid)
returns table (
  contact text,
  is_guardian boolean,
  guardian_name text,
  verification_screenshot_path text
)
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
      case when p.is_minor then p.guardian_name else null end as guardian_name,
      p.verification_screenshot_path
    from public.profiles p
    where p.id = other_id;
end;
$$;

grant execute on function public.get_request_contact(uuid) to authenticated;
