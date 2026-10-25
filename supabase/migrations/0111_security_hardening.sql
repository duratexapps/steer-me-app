-- Security hardening after the clinics / featured listings / lodging work (2026-10-25 audit).
--
-- 1. send_push_via_edge_function was executable by anon and every signed-in user through the public RPC endpoint, which
--    let anyone push any message to any user. Only database code (security definer functions owned by postgres) calls it.
-- 2. A signed-in user could mark their own producer profile 'verified' (producer_profiles had open insert/update
--    policies), skipping verification for producers, instructors and lodging owners. Profiles are now written only by
--    create_producer_profile (security definer) and by staff.
-- 3. A producer could write any column of their own events: free featured_until, publish while unverified, and re-point
--    producer_identity_id or the Draw Pro link columns. The app never updates producer events (only admins edit admin-posted
--    ones), so the producer update policy is dropped and a guard trigger locks the server-owned columns on insert.
-- 4. log_feature_event (callable by anyone) had no volume limit; add a per-visitor and a global per-minute cap.

-- 1
revoke execute on function public.send_push_via_edge_function(uuid, text, text, jsonb) from public, anon, authenticated;

-- 2
drop policy if exists producer_profiles_insert_own on public.producer_profiles;
drop policy if exists producer_profiles_update_own on public.producer_profiles;

-- 3
drop policy if exists events_update_own on public.events;

create or replace function public.guard_event_server_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role scripts, the SQL editor and security definer functions run as another user and are unrestricted. Admins
  -- (app admin accounts post and edit events as role authenticated) are unrestricted too.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    return new;
  end if;

  -- An ordinary producer or instructor creating an event: server-owned columns start empty, and the event is published
  -- only by auto_publish_event for a verified profile.
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

revoke execute on function public.guard_event_server_columns() from public, anon, authenticated;

drop trigger if exists events_00_guard_server_columns on public.events;
create trigger events_00_guard_server_columns
  before insert on public.events
  for each row execute function public.guard_event_server_columns();

-- 4
create index if not exists feature_events_created on public.feature_events (created_at desc);
create index if not exists feature_events_visitor_time on public.feature_events (visitor_id, created_at desc) where visitor_id is not null;
create index if not exists layover_spots_owner on public.layover_spots (owner_id) where owner_id is not null;
create index if not exists featured_purchases_user on public.featured_purchases (user_id, created_at desc);

create or replace function public.log_feature_event(p_feature text, p_event text, p_props jsonb default '{}'::jsonb, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feature not in ('travel_checker', 'layover_finder') then return; end if;
  if p_event not in ('view', 'check', 'helpful_yes', 'helpful_no', 'report_error', 'open_official', 'open_from_app',
                     'gate_shown', 'open_layovers', 'search', 'spot_call', 'spot_website', 'spot_hotels', 'spot_directions', 'suggest_spot') then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2000 then return; end if;
  -- Volume caps: 60 events a minute per visitor, 1,500 a minute overall. A real person never gets near either.
  if p_visitor is not null and (select count(*) from public.feature_events where visitor_id = left(p_visitor, 64) and created_at > now() - interval '1 minute') >= 60 then return; end if;
  if (select count(*) from public.feature_events where created_at > now() - interval '1 minute') >= 1500 then return; end if;
  insert into public.feature_events (feature, event, props, visitor_id, user_id)
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), null);
end;
$$;
