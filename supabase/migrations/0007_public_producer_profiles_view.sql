-- Exposes only what athletes need to see a "Verified Producer" badge.
-- contact_info and verification_doc_path never leave producer_profiles.

create view public.public_producer_profiles
with (security_invoker = false) as
select id, org_name, verification_status
from public.producer_profiles;

grant select on public.public_producer_profiles to authenticated;
