-- Free-tier limit checks (migration 0129, 2026-11-08). Run against the linked project:
--   npx supabase db query --remote --yes -f supabase/tests/free_tier_limits.sql
-- One transaction, rolled back; nothing is left behind. (Test emails must NOT end in @steerme.test or similar: migration 0121 auto-flags those as demo accounts, which are exempt from the limits.) The LAST statement prints one row per check: PASS or FAIL.
-- Covers: the 3-open-request cap, withdraw, 7-day expiry, the 1-active-need-post cap, who is exempt, and who may call what.
begin;
create temp table results (n serial, check_name text, outcome text);
grant all on results to anon, authenticated;
grant usage, select on sequence results_n_seq to anon, authenticated;

-- paywall on for the test (it is on in production, but do not depend on it)
insert into app_settings (key, value) values ('paywall_enabled', 'true'::jsonb) on conflict (key) do update set value = 'true'::jsonb;

insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','free@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paid@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','demo@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r1@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r2@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r3@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r4@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a015','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r5@limits-check.invalid'),
 ('00000000-0000-0000-0000-00000000a016','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r6@limits-check.invalid');
insert into profiles (id, full_name, position, home_area, contact, global_classification, header_classification, heeler_classification) values
 ('00000000-0000-0000-0000-00000000a001','Free Member','Header','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a002','Paid Member','Header','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a003','Demo Member','Header','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a011','R One','Heeler','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a012','R Two','Heeler','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a013','R Three','Heeler','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a014','R Four','Heeler','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a015','R Five','Heeler','Boise, ID','c',5,5,5),
 ('00000000-0000-0000-0000-00000000a016','R Six','Heeler','Boise, ID','c',5,5,5);
update profiles set is_demo = true where id in ('00000000-0000-0000-0000-00000000a003');
insert into comped_users (user_id, note) values ('00000000-0000-0000-0000-00000000a002', 'test paying member');

-- Pure function checks (run as the table owner)
insert into results(check_name,outcome) values
 ('free member is not a paying member', case when not is_paying_member('00000000-0000-0000-0000-00000000a001') then 'PASS' else 'FAIL' end),
 ('...but still passes the 3-free-matches gate', case when has_active_subscription('00000000-0000-0000-0000-00000000a001') then 'PASS' else 'FAIL' end),
 ('comped member is a paying member', case when is_paying_member('00000000-0000-0000-0000-00000000a002') then 'PASS' else 'FAIL' end),
 ('limits apply to a free member, not to paid or demo', case when free_tier_limits_apply('00000000-0000-0000-0000-00000000a001') and not free_tier_limits_apply('00000000-0000-0000-0000-00000000a002') and not free_tier_limits_apply('00000000-0000-0000-0000-00000000a003') then 'PASS' else 'FAIL' end);

-- FREE member: 3 open requests allowed, the 4th is refused; a withdrawn one frees a slot
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}',true);
do $$ declare h text; rid uuid; ok boolean; begin
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a011', 9);
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a012', 9);
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a013', 9);
  insert into results(check_name,outcome) values ('free member can have 3 open requests', case when (select count(*) from partner_requests where requester_id='00000000-0000-0000-0000-00000000a001')=3 then 'PASS' else 'FAIL' end);
  begin
    insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a014', 9);
    insert into results(check_name,outcome) values ('free member cannot open a 4th request','FAIL');
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    insert into results(check_name,outcome) values ('free member cannot open a 4th request (hint open_request_limit)', case when h='open_request_limit' then 'PASS' else 'FAIL' end);
  end;
  select id into rid from partner_requests where recipient_id='00000000-0000-0000-0000-00000000a013';
  perform withdraw_partner_request(rid);
  insert into results(check_name,outcome) values ('withdraw removes the request', case when not exists (select 1 from partner_requests where id=rid) then 'PASS' else 'FAIL' end);
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a014', 9);
  insert into results(check_name,outcome) values ('withdrawing frees a slot', case when (select count(*) from partner_requests where requester_id='00000000-0000-0000-0000-00000000a001')=3 then 'PASS' else 'FAIL' end);
end $$;

-- Someone else cannot withdraw a request that is not theirs; a recipient cannot either
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a011","role":"authenticated"}',true);
do $$ declare rid uuid; begin
  select id into rid from partner_requests where recipient_id='00000000-0000-0000-0000-00000000a011';
  begin
    perform withdraw_partner_request(rid);
    insert into results(check_name,outcome) values ('recipient cannot withdraw the sender''s request','FAIL');
  exception when others then
    insert into results(check_name,outcome) values ('recipient cannot withdraw the sender''s request','PASS');
  end;
end $$;

-- FREE member need posts: 1 active allowed, a 2nd refused, a goat roping post counts, a past one does not
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}',true);
do $$ declare h text; begin
  insert into need_posts (is_goat_roping, division, event_date, event_name, producer_name) values (false, 9, current_date - 10, 'Old roping', 'P');
  insert into results(check_name,outcome) values ('a past need post does not count as active', case when (select count(*) from need_posts where athlete_id='00000000-0000-0000-0000-00000000a001')=1 then 'PASS' else 'FAIL' end);
  insert into need_posts (is_goat_roping, division, event_date, event_name, producer_name) values (false, 9, current_date + 5, 'Roping A', 'P');
  begin
    insert into need_posts (is_goat_roping, division, event_date, event_name, producer_name) values (false, 9, current_date + 6, 'Roping B', 'P');
    insert into results(check_name,outcome) values ('free member cannot have a 2nd active need post','FAIL');
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    insert into results(check_name,outcome) values ('free member cannot have a 2nd active need post (hint need_post_limit)', case when h='need_post_limit' then 'PASS' else 'FAIL' end);
  end;
  begin
    insert into need_posts (is_goat_roping, division, event_date, event_name, producer_name) values (true, null, current_date + 6, 'Goat', 'P');
    insert into results(check_name,outcome) values ('a goat roping post counts toward the limit','FAIL');
  exception when others then
    insert into results(check_name,outcome) values ('a goat roping post counts toward the limit','PASS');
  end;
end $$;

-- PAYING (comped) member and DEMO account: no limits
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}',true);
do $$ begin
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a011', 9), ('00000000-0000-0000-0000-00000000a012', 9), ('00000000-0000-0000-0000-00000000a013', 9), ('00000000-0000-0000-0000-00000000a014', 9), ('00000000-0000-0000-0000-00000000a015', 9);
  insert into need_posts (is_goat_roping, division, event_date, event_name, producer_name) values (false, 9, current_date + 5, 'P1', 'P'), (false, 9, current_date + 6, 'P2', 'P');
  insert into results(check_name,outcome) values ('paying member has no request or need-post limit', case when (select count(*) from partner_requests where requester_id='00000000-0000-0000-0000-00000000a002')=5 and (select count(*) from need_posts where athlete_id='00000000-0000-0000-0000-00000000a002')=2 then 'PASS' else 'FAIL' end);
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}',true);
do $$ begin
  insert into partner_requests (recipient_id, division) values ('00000000-0000-0000-0000-00000000a011', 9), ('00000000-0000-0000-0000-00000000a012', 9), ('00000000-0000-0000-0000-00000000a013', 9), ('00000000-0000-0000-0000-00000000a014', 9);
  insert into results(check_name,outcome) values ('demo/test account is exempt from the request limit', case when (select count(*) from partner_requests where requester_id='00000000-0000-0000-0000-00000000a003')=4 then 'PASS' else 'FAIL' end);
end $$;

-- What the app reads
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}',true);
do $$ declare s jsonb; begin
  s := get_free_tier_status();
  insert into results(check_name,outcome) values ('get_free_tier_status reports the limits', case when (s->>'limits_apply')::boolean and (s->>'open_requests_used')::int=3 and (s->>'open_requests_limit')::int=3 and (s->>'need_posts_used')::int=1 and (s->>'subscribed')::boolean=false then 'PASS' else 'FAIL' end);
end $$;

-- Nobody signed in can call the internals
do $$ begin
  begin perform is_paying_member('00000000-0000-0000-0000-00000000a001'); insert into results(check_name,outcome) values ('member cannot call is_paying_member','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot call is_paying_member','PASS'); end;
  begin perform expire_stale_partner_requests(); insert into results(check_name,outcome) values ('member cannot run the expiry job','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot run the expiry job','PASS'); end;
  begin perform run_instant_roping_alerts(true); insert into results(check_name,outcome) values ('member cannot trigger instant alerts','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot trigger instant alerts','PASS'); end;
  begin perform count(*) from alert_sends; insert into results(check_name,outcome) values ('alert_sends is not readable by members', case when (select count(*) from alert_sends)=0 then 'PASS' else 'FAIL' end); exception when others then insert into results(check_name,outcome) values ('alert_sends is not readable by members','PASS'); end;
  begin perform count(*) from partner_request_closures; insert into results(check_name,outcome) values ('closures table is not readable by members', case when (select count(*) from partner_request_closures)=0 then 'PASS' else 'FAIL' end); exception when others then insert into results(check_name,outcome) values ('closures table is not readable by members','PASS'); end;
end $$;

-- Expiry: an 8-day-old unanswered request closes, a 3-day-old and an old ACCEPTED one stay (back to the owner role to set up)
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into partner_requests (requester_id, recipient_id, division, status, created_at) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a016', 9, 'pending', now() - interval '8 days');
update partner_requests set status = 'accepted', created_at = now() - interval '9 days' where requester_id='00000000-0000-0000-0000-00000000a002' and recipient_id='00000000-0000-0000-0000-00000000a011';
update partner_requests set created_at = now() - interval '3 days' where requester_id='00000000-0000-0000-0000-00000000a002' and recipient_id='00000000-0000-0000-0000-00000000a012';
update partner_requests set created_at = now() - interval '10 days' where requester_id='00000000-0000-0000-0000-00000000a003';
do $$ declare n integer; begin
  n := expire_stale_partner_requests();
  insert into results(check_name,outcome) values ('expiry closes only the old unanswered request', case when n >= 1 and not exists (select 1 from partner_requests where requester_id='00000000-0000-0000-0000-00000000a001' and recipient_id='00000000-0000-0000-0000-00000000a016') then 'PASS' else 'FAIL' end);
  insert into results(check_name,outcome) values ('expiry leaves accepted, recent and demo requests alone', case when exists (select 1 from partner_requests where requester_id='00000000-0000-0000-0000-00000000a002' and recipient_id='00000000-0000-0000-0000-00000000a011' and status='accepted') and exists (select 1 from partner_requests where requester_id='00000000-0000-0000-0000-00000000a002' and recipient_id='00000000-0000-0000-0000-00000000a012') and exists (select 1 from partner_requests where requester_id='00000000-0000-0000-0000-00000000a003') then 'PASS' else 'FAIL' end);
  insert into results(check_name,outcome) values ('expiry and withdraw are both logged', case when exists (select 1 from partner_request_closures where reason='expired' and requester_id='00000000-0000-0000-0000-00000000a001') and exists (select 1 from partner_request_closures where reason='withdrawn' and requester_id='00000000-0000-0000-0000-00000000a001') then 'PASS' else 'FAIL' end);
end $$;

-- Instant alerts bookkeeping: turning instant on stamps instant_since, turning it off clears it
insert into alert_prefs (user_id, instant) values ('00000000-0000-0000-0000-00000000a002', true);
do $$ begin
  insert into results(check_name,outcome) values ('turning instant on stamps instant_since', case when (select instant_since is not null from alert_prefs where user_id='00000000-0000-0000-0000-00000000a002') then 'PASS' else 'FAIL' end);
  update alert_prefs set instant = false where user_id='00000000-0000-0000-0000-00000000a002';
  insert into results(check_name,outcome) values ('turning instant off clears instant_since', case when (select instant_since is null from alert_prefs where user_id='00000000-0000-0000-0000-00000000a002') then 'PASS' else 'FAIL' end);
end $$;

select n, check_name, outcome from results order by n;
rollback;
