-- The only way another user's profile is ever readable. Deliberately omits
-- contact, guardian_contact, global_membership_id, and
-- verification_screenshot_path - those columns don't exist in this view at
-- all, so no query against it can ever return them, regardless of client
-- bugs. This view is owned by the migration-running role, so it bypasses the
-- base table's owner-only RLS (profiles is never given FORCE ROW LEVEL
-- SECURITY, so the owning role's queries - including this view's - see every
-- row); its own WHERE clause then filters out suspended and blocked profiles
-- before re-exposing the safe columns to `authenticated`.

create view public.public_profiles
with (security_invoker = false) as
select
  id,
  full_name,
  "position",
  home_area,
  global_classification,
  avatar_url,
  is_minor
from public.profiles
where not suspended
  and (auth.uid() is null or not public.is_blocked_pair(auth.uid(), id));

grant select on public.public_profiles to authenticated;
