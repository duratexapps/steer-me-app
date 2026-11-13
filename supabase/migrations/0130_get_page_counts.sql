-- Count visits to the /get landing page by source tag, anonymously (Justin, 2026-11-13).
--
-- Facebook posts now link to steerme.ropingtools.com/get?src=<tag> (for example fb-okmn-profile or fb-okmn-page), so we can
-- tell which kind of post actually brings people. This reuses the anonymous feature_events log: website only, no account
-- id, no email, the native apps send nothing (store privacy labels say no usage data). The tag is a short word chosen by us
-- and is sanitised in the page before it is sent. Same function as 0126 with one more feature ('get_page') and four more
-- events (the store, tour and web buttons on that page).
create or replace function public.log_feature_event(p_feature text, p_event text, p_props jsonb default '{}'::jsonb, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feature not in ('travel_checker', 'layover_finder', 'age_gate', 'get_page') then return; end if;
  if p_event not in ('view', 'check', 'helpful_yes', 'helpful_no', 'report_error', 'open_official', 'open_from_app',
                     'gate_shown', 'open_layovers', 'search', 'spot_call', 'spot_website', 'spot_hotels', 'spot_directions', 'suggest_spot',
                     'passed', 'blocked_under_13',
                     'get_ios', 'get_android', 'get_tour', 'get_web') then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2000 then return; end if;
  if p_visitor is not null and (select count(*) from public.feature_events where visitor_id = left(p_visitor, 64) and created_at > now() - interval '1 minute') >= 60 then return; end if;
  if (select count(*) from public.feature_events where created_at > now() - interval '1 minute') >= 1500 then return; end if;
  insert into public.feature_events (feature, event, props, visitor_id, user_id)
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), null);
end;
$$;
