-- Security regression checks (2026-10-25 audit). Run against the linked project:
--   npx supabase db query --linked -f supabase/tests/security_regression.sql
-- Everything runs in one transaction that is rolled back; nothing is left behind. The LAST statement prints one row per
-- check: PASS or FAIL. Any FAIL means a protection described in DOCS/security-audit-2026-10-25.md has regressed.
begin;
create temp table results (n serial, check_name text, outcome text);
grant all on results to anon, authenticated;
grant usage, select on sequence results_n_seq to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-req@steerme.test'),
 ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rec@steerme.test'),
 ('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-vic@steerme.test'),
 ('00000000-0000-0000-0000-00000000f004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-prod@steerme.test'),
 ('00000000-0000-0000-0000-00000000f005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-lodg@steerme.test'),
 ('00000000-0000-0000-0000-00000000f006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-clin@steerme.test');
insert into profiles (id, full_name, position, home_area, contact, global_classification, header_classification, heeler_classification) values
 ('00000000-0000-0000-0000-00000000f001','Req One','Header','Boise, ID','req-contact',5,5,5),
 ('00000000-0000-0000-0000-00000000f002','Rec Two','Heeler','Boise, ID','rec-contact',5,5,5),
 ('00000000-0000-0000-0000-00000000f003','Victim Three','Header','Boise, ID','VICTIM-SECRET',5,5,5);
insert into producer_profiles (id, org_name, verification_status, is_lodging) values ('00000000-0000-0000-0000-00000000f005','T Inn','verified',true);
insert into producer_profiles (id, org_name, verification_status, is_clinician) values ('00000000-0000-0000-0000-00000000f006','T Clinic','verified',true);
insert into partner_requests (requester_id, recipient_id, division, status) values ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000f002',9,'pending');
create temp table adm as select id from profiles where is_admin limit 1;
grant select on adm to authenticated;

-- anon
set local role anon;
do $$ begin
  begin perform count(*) from public_profiles; insert into results(check_name,outcome) values ('anon cannot read public_profiles','FAIL'); exception when others then insert into results(check_name,outcome) values ('anon cannot read public_profiles','PASS'); end;
  begin perform count(*) from public_finale_flags; insert into results(check_name,outcome) values ('anon cannot read public_finale_flags','FAIL'); exception when others then insert into results(check_name,outcome) values ('anon cannot read public_finale_flags','PASS'); end;
  begin perform send_push_via_edge_function('00000000-0000-0000-0000-00000000f003','x','y',null); insert into results(check_name,outcome) values ('anon cannot call push RPC','FAIL'); exception when others then insert into results(check_name,outcome) values ('anon cannot call push RPC','PASS'); end;
  insert into results(check_name,outcome) values ('anon sees no travel_rules / layover_spots / app_settings', case when (select count(*) from travel_rules)+(select count(*) from layover_spots)+(select count(*) from app_settings)=0 then 'PASS' else 'FAIL' end);
end $$;

-- ordinary signed-in user (the recipient)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}',true);
do $$ declare rid uuid; c text; begin
  insert into results(check_name,outcome) values ('member can read public_profiles', case when (select count(*) from public_profiles)>0 then 'PASS' else 'FAIL' end);
  begin perform send_push_via_edge_function('00000000-0000-0000-0000-00000000f003','x','y',null); insert into results(check_name,outcome) values ('member cannot call push RPC','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot call push RPC','PASS'); end;
  begin insert into producer_profiles (id, org_name, verification_status) values ('00000000-0000-0000-0000-00000000f002','Evil','verified'); insert into results(check_name,outcome) values ('member cannot insert a verified producer profile','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot insert a verified producer profile','PASS'); end;
  perform create_producer_profile('Legit Co','n','c',null,'d/p',null,false,false);
  update producer_profiles set verification_status='verified' where id='00000000-0000-0000-0000-00000000f002';
  insert into results(check_name,outcome) values ('RPC creates pending; self-update cannot verify', case when (select verification_status from producer_profiles where id='00000000-0000-0000-0000-00000000f002')='pending' then 'PASS' else 'FAIL' end);
  insert into events (name,event_date,location,entry_fee,divisions,description,featured_until,status,draw_pro_entry_url,posted_by_admin) values ('Forged',current_date+5,'Boise, ID','1',array[9]::numeric(3,1)[],'d',now()+interval '3650 days','published','http://evil',true);
  insert into results(check_name,outcome) values ('forged event columns are reset', case when (select status='pending_review' and featured_until is null and draw_pro_entry_url is null and not posted_by_admin from events where name='Forged') then 'PASS' else 'FAIL' end);
  update events set featured_until=now()+interval '3650 days', status='published' where name='Forged';
  insert into results(check_name,outcome) values ('producer cannot update own event', case when (select status='pending_review' and featured_until is null from events where name='Forged') then 'PASS' else 'FAIL' end);
  select id into rid from partner_requests where recipient_id='00000000-0000-0000-0000-00000000f002';
  begin update partner_requests set status='accepted', requester_id='00000000-0000-0000-0000-00000000f003' where id=rid; insert into results(check_name,outcome) values ('recipient cannot rewrite requester_id','FAIL'); exception when others then insert into results(check_name,outcome) values ('recipient cannot rewrite requester_id','PASS'); end;
  update partner_requests set status='accepted' where id=rid;
  insert into results(check_name,outcome) values ('recipient can still accept a pending request', case when (select status from partner_requests where id=rid)='accepted' then 'PASS' else 'FAIL' end);
  begin update partner_requests set status='declined' where id=rid; insert into results(check_name,outcome) values ('answered request cannot be flipped','FAIL'); exception when others then insert into results(check_name,outcome) values ('answered request cannot be flipped','PASS'); end;
  select contact into c from get_request_contact(rid);
  insert into results(check_name,outcome) values ('contact reveal returns the real requester only', case when c='req-contact' then 'PASS' else 'FAIL' end);
  insert into user_reports (target_user_id, reporter_id, offense, description, status) values ('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-00000000f002','Harassment','t','confirmed');
  insert into results(check_name,outcome) values ('new user report starts open', case when (select status from user_reports where reporter_id='00000000-0000-0000-0000-00000000f002')='open' then 'PASS' else 'FAIL' end);
  insert into issue_reports (reporter_id, role, description, status, draft_reply, triage_note, resolution_type) values ('00000000-0000-0000-0000-00000000f002','contestant','t','resolved','PHISH','x','fixed');
  insert into results(check_name,outcome) values ('issue report staff columns are cleared', case when (select status='new' and draft_reply is null and triage_note is null and resolution_type is null from issue_reports where reporter_id='00000000-0000-0000-0000-00000000f002') then 'PASS' else 'FAIL' end);
  begin insert into horse_documents (owner_id, horse_name, document_path) values ('00000000-0000-0000-0000-00000000f002','Dun','00000000-0000-0000-0000-00000000f003/stolen.jpg'); insert into results(check_name,outcome) values ('horse document path outside own folder is rejected','FAIL'); exception when others then insert into results(check_name,outcome) values ('horse document path outside own folder is rejected','PASS'); end;
  begin insert into featured_purchases (user_id,target_type,target_id,amount_cents,days,status) values ('00000000-0000-0000-0000-00000000f002','event',gen_random_uuid(),1,1,'paid'); insert into results(check_name,outcome) values ('member cannot write featured_purchases','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot write featured_purchases','PASS'); end;
  begin insert into layover_spots (name,kind,state,city,verification,source_name,source_url,verified_on,owner_id,review_status) values ('z','hotel','ID','Boise','unverified','x','http://x',current_date,'00000000-0000-0000-0000-00000000f002','approved'); insert into results(check_name,outcome) values ('member cannot insert a layover spot directly','FAIL'); exception when others then insert into results(check_name,outcome) values ('member cannot insert a layover spot directly','PASS'); end;
end $$;

-- verified instructor
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f006","role":"authenticated"}',true);
do $$ begin
  insert into events (name,event_date,location,entry_fee,divisions,description) values ('Clinic ok',current_date+5,'Boise, ID','1',array[19]::numeric(3,1)[],'d');
  insert into results(check_name,outcome) values ('verified instructor still publishes a clinic', case when (select status='published' and is_clinic from events where name='Clinic ok') then 'PASS' else 'FAIL' end);
end $$;

-- verified lodging owner: hotel parking rules
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f005","role":"authenticated"}',true);
do $$ declare r text; begin
  begin perform submit_layover_listing('Inn','hotel','Boise','ID',null,'5551234567',null,false,false,null,false,null,null,false,true,null); insert into results(check_name,outcome) values ('hotel without trailer parking is rejected','FAIL'); exception when others then insert into results(check_name,outcome) values ('hotel without trailer parking is rejected','PASS'); end;
  begin perform submit_layover_listing('Inn','hotel','Boise','ID',null,'5551234567',null,false,false,null,false,null,null,true,null,null); insert into results(check_name,outcome) values ('hotel must answer secure/not secure','FAIL'); exception when others then insert into results(check_name,outcome) values ('hotel must answer secure/not secure','PASS'); end;
  perform submit_layover_listing('Inn','hotel','Boise','ID',null,'5551234567',null,false,false,null,false,null,null,true,false,'open lot');
  insert into results(check_name,outcome) values ('hotel with parking saves as pending and not secure', case when (select review_status='pending' and parking_secure=false from layover_spots where owner_id='00000000-0000-0000-0000-00000000f005') then 'PASS' else 'FAIL' end);
end $$;

-- existing admin can still post
do $$ begin
  if exists (select 1 from adm) then
    perform set_config('request.jwt.claims', json_build_object('sub',(select id from adm),'role','authenticated')::text, true);
    insert into events (name,event_date,location,entry_fee,divisions,description,producer_id,posted_by_admin,admin_poster_id,status,external_producer_name) values ('Admin ok',current_date+5,'Boise, ID','1',array[9]::numeric(3,1)[],'d',null,true,(select id from adm),'published','Ext');
    insert into results(check_name,outcome) values ('admin posting is unaffected', case when (select status='published' and posted_by_admin from events where name='Admin ok') then 'PASS' else 'FAIL' end);
  end if;
end $$;

reset role;
select n, check_name, outcome from results order by n;
rollback;
