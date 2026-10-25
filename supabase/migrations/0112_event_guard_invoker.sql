-- 0111 made guard_event_server_columns security definer, so current_user was always the function owner and the guard never
-- applied to ordinary users. It must run as the invoker (like guard_profile_protected_columns): an authenticated user reads
-- their own profile row to check is_admin, and service-role scripts / security definer functions keep their own role.
create or replace function public.guard_event_server_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    return new;
  end if;

  new.status := 'pending_review';
  new.featured_until := null;
  new.posted_by_admin := false;
  new.admin_poster_id := null;
  new.draw_pro_event_id := null;
  new.draw_pro_entry_url := null;
  new.private_to_user_id := null;
  new.producer_identity_id := null;
  new.tags_checked_at := null;
  return new;
end;
$$;
