-- The hauling-paperwork counts are anonymous: stop recording the signed-in user id (the privacy policy says so), and
-- clear any ids already stored. Visitor ids are random values from the visitor's own browser, not account ids.
create or replace function public.log_feature_event(p_feature text, p_event text, p_props jsonb default '{}'::jsonb, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feature not in ('travel_checker') then return; end if;
  if p_event not in ('view', 'check', 'helpful_yes', 'helpful_no', 'report_error', 'open_official', 'open_from_app') then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2000 then return; end if;
  insert into public.feature_events (feature, event, props, visitor_id, user_id)
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), null);
end;
$$;
update public.feature_events set user_id = null where user_id is not null;
