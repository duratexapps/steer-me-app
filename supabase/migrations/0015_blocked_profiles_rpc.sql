-- public_profiles deliberately excludes anyone the caller has blocked (so a
-- blocked user never appears in Browse/matching), which means it can't also
-- be used to render the "Manage Blocked Users" screen - the caller already
-- knows about the block, so showing them that person's ordinary safe public
-- fields here isn't a new privacy leak, it's what managing the block list
-- requires.

create or replace function public.get_blocked_profiles()
returns table (
  id uuid,
  full_name text,
  "position" text,
  home_area text,
  global_classification numeric,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.position, p.home_area, p.global_classification, p.avatar_url
  from public.profiles p
  join public.blocks b on b.blocked_id = p.id
  where b.blocker_id = auth.uid();
$$;

grant execute on function public.get_blocked_profiles() to authenticated;
