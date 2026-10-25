-- Second-pass audit (2026-10-25): user-writable rows whose server-owned or identity columns the owner could rewrite.
-- All guards are security INVOKER on purpose (a security definer guard would see current_user = its owner and never apply).
-- Service-role scripts, the SQL editor and security definer functions run as another user and are unrestricted.

-- 1. partner_requests: the recipient's update policy only required status to be accepted/declined, so a recipient could also
--    rewrite requester_id to any other member and then call get_request_contact() to read that member's phone/email and card
--    screenshot path, or burn that member's free matches. Now a recipient can only answer a request that is still waiting.
create or replace function public.guard_partner_request_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.requester_id is distinct from old.requester_id
     or new.recipient_id is distinct from old.recipient_id
     or new.event_id is distinct from old.event_id
     or new.division is distinct from old.division
     or new.need_post_id is distinct from old.need_post_id
     or new.is_goat_roping is distinct from old.is_goat_roping
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the response to a request can be changed' using errcode = '42501';
  end if;
  if old.status not in ('pending', 'pending_guardian') then
    raise exception 'This request has already been answered' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists partner_requests_00_guard_update on public.partner_requests;
create trigger partner_requests_00_guard_update
  before update on public.partner_requests
  for each row execute function public.guard_partner_request_update();

-- 2. Reports: the reporter could insert a report already marked confirmed (inflating the confirmed count that triggers the
--    automatic suspend and data scrub on a real confirmation), or pre-fill the staff-only columns of an issue report
--    (draft_reply, triage_note, resolution) that the triage routine and staff read as their own. Reports always start fresh.
create or replace function public.guard_report_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_table_name = 'user_reports' then
    new.status := 'open';
  elsif tg_table_name = 'event_reports' then
    new.status := 'open';
    new.priority := 'high';
  elsif tg_table_name = 'issue_reports' then
    new.status := 'new';
    new.resolution_type := null;
    new.draft_reply := null;
    new.triage_note := null;
    new.triaged_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_reports_00_guard_insert on public.user_reports;
create trigger user_reports_00_guard_insert before insert on public.user_reports for each row execute function public.guard_report_insert();
drop trigger if exists event_reports_00_guard_insert on public.event_reports;
create trigger event_reports_00_guard_insert before insert on public.event_reports for each row execute function public.guard_report_insert();
drop trigger if exists issue_reports_00_guard_insert on public.issue_reports;
create trigger issue_reports_00_guard_insert before insert on public.issue_reports for each row execute function public.guard_report_insert();

-- 3. horse_documents.document_path is signed by the get-coggins-share function with the service role, so a path pointing into
--    another member's folder could expose that member's Coggins file through a share link. A document must live in its
--    owner's own folder.
alter table public.horse_documents
  add constraint horse_documents_path_in_owner_folder check (document_path like owner_id::text || '/%') not valid;
alter table public.horse_documents validate constraint horse_documents_path_in_owner_folder;

revoke execute on function public.guard_partner_request_update() from public, anon, authenticated;
revoke execute on function public.guard_report_insert() from public, anon, authenticated;
