-- Age screen on new accounts (Justin, 2026-11-06): Steer Me is for ropers 13 and older.
--
-- The app asks for a birth month and year before any email address is collected (src/lib/age-gate.ts). The birth
-- month and year are never stored or sent. This migration only lets the website count, anonymously, how many people
-- pass the screen and how many are stopped, so we can see how many under-13 ropers actually show up before deciding
-- whether a "dependents on a parent account" feature is worth building. Counts only: the existing anonymous
-- feature_events log (no user id, no email) is reused. The native apps send nothing, because the store privacy
-- labels say they collect no usage data.
--
-- Same function as migration 0111, with one more allowed feature ('age_gate') and two more allowed events. Nothing
-- else about it changes (volume caps, size cap, user_id always null).
create or replace function public.log_feature_event(p_feature text, p_event text, p_props jsonb default '{}'::jsonb, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feature not in ('travel_checker', 'layover_finder', 'age_gate') then return; end if;
  if p_event not in ('view', 'check', 'helpful_yes', 'helpful_no', 'report_error', 'open_official', 'open_from_app',
                     'gate_shown', 'open_layovers', 'search', 'spot_call', 'spot_website', 'spot_hotels', 'spot_directions', 'suggest_spot',
                     'passed', 'blocked_under_13') then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2000 then return; end if;
  -- Volume caps: 60 events a minute per visitor, 1,500 a minute overall. A real person never gets near either.
  if p_visitor is not null and (select count(*) from public.feature_events where visitor_id = left(p_visitor, 64) and created_at > now() - interval '1 minute') >= 60 then return; end if;
  if (select count(*) from public.feature_events where created_at > now() - interval '1 minute') >= 1500 then return; end if;
  insert into public.feature_events (feature, event, props, visitor_id, user_id)
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), null);
end;
$$;
