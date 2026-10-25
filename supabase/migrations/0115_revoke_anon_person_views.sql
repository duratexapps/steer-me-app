-- public_profiles and public_finale_flags are person-level views that run with their owner's rights and deliberately allow
-- auth.uid() IS NULL (service-role scripts). Because anon holds the default SELECT grant, anyone with the public app key could
-- read every member's name, home area, classification, minor flag and Finale status without signing in. Only signed-in
-- members (and the service role) need them.
revoke select on public.public_profiles from anon;
revoke select on public.public_finale_flags from anon;
