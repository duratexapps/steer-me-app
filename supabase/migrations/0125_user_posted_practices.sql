-- User-posted practices (Justin, 2026-10-31): any signed-in member with a finished profile can post a practice, with
-- no separate producer / clinic / hotel sign-up. They need a place, a date (or a weekly series) and a time.
--
-- A practice has no money, ratings or classes, so there is no verification step. Instead it is limited by the database:
-- all writes go through the three functions below (nobody can insert or update a user-posted event directly), with a cap
-- of 3 live practices and 5 new ones per rolling 24 hours per person, link and profanity checks, and a take-down
-- function the poster can use. Everyone can still report a listing, and the nightly sweep lists new ones.
--
-- events.producer_id points at producer_profiles, so a member's practice is owned through its own column.

alter table public.events
  add column posted_by_user_id uuid references public.profiles(id) on delete cascade;

alter table public.events drop constraint events_producer_or_draw_pro_or_admin_source;
alter table public.events
  add constraint events_producer_or_draw_pro_or_admin_source
  check (producer_id is not null or draw_pro_event_id is not null or posted_by_admin = true or posted_by_user_id is not null);
alter table public.events
  add constraint events_user_posted_is_practice check (posted_by_user_id is null or is_practice);

create index events_posted_by_user_idx on public.events (posted_by_user_id, created_at) where posted_by_user_id is not null;

-- A direct client insert can never claim a member-posted practice (same pattern as the other server-owned columns).
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
  new.posted_by_user_id := null;
  new.draw_pro_event_id := null;
  new.draw_pro_entry_url := null;
  new.private_to_user_id := null;
  new.producer_identity_id := null;
  new.tags_checked_at := null;
  return new;
end;
$$;

-- Returns a plain-language problem with a piece of free text, or null when it is fine.
create or replace function public.practice_text_problem(t text)
returns text
language sql
immutable
as $$
  select case
    when t is null then null
    when t ~* '(https?://|www\.|\.com\y|\.net\y|\.org\y|bit\.ly)' then 'Links are not allowed in a practice listing. Describe it in words instead.'
    when t ~* '\m(fuck\w*|shit\w*|bitch\w*|asshole\w*|cunt\w*|nigg\w*|fag\w*)\M' then 'Please keep the listing family-friendly.'
    else null
  end
$$;

-- One shared validator so create and anything added later cannot drift apart.
create or replace function public.practice_check_inputs(
  p_name text, p_host text, p_location text, p_venue_address text, p_date date, p_weekly boolean, p_end_date date,
  p_time text, p_cost text, p_notes text, p_contact text, p_entry_method text, p_entry_phone text
) returns void
language plpgsql
set search_path = public
as $$
declare
  problem text;
  f text;
begin
  if length(btrim(coalesce(p_name, ''))) < 3 or length(p_name) > 80 then
    raise exception 'Give the practice a name (3 to 80 characters).' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_host, ''))) < 2 or length(p_host) > 60 then
    raise exception 'Say who is hosting it (2 to 60 characters).' using errcode = 'check_violation';
  end if;
  if coalesce(p_location, '') !~ '^[^,]{2,60}, ?[A-Za-z]{2}$' then
    raise exception 'Pick the town from the list, for example Wickenburg, AZ.' using errcode = 'check_violation';
  end if;
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 180 then
    raise exception 'Pick a start date within the next 6 months.' using errcode = 'check_violation';
  end if;
  if coalesce(p_weekly, false) then
    if p_end_date is null or p_end_date < p_date + 7 or p_end_date > p_date + 120 then
      raise exception 'For a weekly practice, pick a last date between 1 and 17 weeks after the first one.' using errcode = 'check_violation';
    end if;
  elsif p_end_date is not null then
    raise exception 'A single practice has no end date.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_time, ''))) < 3 or length(p_time) > 40 then
    raise exception 'Add the time, for example 6:00 to 8:00 PM.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_cost, ''))) < 1 or length(p_cost) > 40 then
    raise exception 'Add the cost, for example $25 per roper, or Free.' using errcode = 'check_violation';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Keep the extra details under 500 characters.' using errcode = 'check_violation';
  end if;
  if length(coalesce(p_venue_address, '')) > 120 or length(coalesce(p_contact, '')) > 80 then
    raise exception 'The address or contact is too long.' using errcode = 'check_violation';
  end if;
  if p_entry_method is not null and p_entry_method not in ('text', 'call') then
    raise exception 'Pick text or call.' using errcode = 'check_violation';
  end if;
  if p_entry_method is not null and regexp_replace(coalesce(p_entry_phone, ''), '\D', '', 'g') !~ '^1?\d{10}$' then
    raise exception 'Add a 10-digit phone number for the Text or Call button.' using errcode = 'check_violation';
  end if;
  foreach f in array array[p_name, p_host, p_venue_address, p_time, p_cost, p_notes, p_contact] loop
    problem := public.practice_text_problem(f);
    if problem is not null then
      raise exception '%', problem using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

create or replace function public.create_user_practice(
  p_name text, p_host text, p_location text, p_venue_address text, p_date date, p_weekly boolean, p_end_date date,
  p_time text, p_cost text, p_notes text, p_contact text, p_entry_method text, p_entry_phone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  schedule text;
  full_description text;
begin
  if uid is null then
    raise exception 'Sign in to post a practice.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.profiles where id = uid and not coalesce(suspended, false) and not coalesce(scrubbed, false)) then
    raise exception 'Finish your roper profile before posting a practice.' using errcode = 'insufficient_privilege';
  end if;

  perform public.practice_check_inputs(p_name, p_host, p_location, p_venue_address, p_date, p_weekly, p_end_date,
    p_time, p_cost, p_notes, p_contact, p_entry_method, p_entry_phone);

  if (select count(*) from public.events
        where posted_by_user_id = uid and status = 'published' and coalesce(event_end_date, event_date) >= current_date) >= 3 then
    raise exception 'You already have 3 practices listed. Take one down before posting another.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.events where posted_by_user_id = uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You have posted several practices today. Try again tomorrow.' using errcode = 'check_violation';
  end if;

  if coalesce(p_weekly, false) then
    schedule := 'Every ' || trim(to_char(p_date, 'Day')) || ', ' || trim(to_char(p_date, 'FMMonth FMDD')) || ' through ' || trim(to_char(p_end_date, 'FMMonth FMDD')) || '.';
  else
    schedule := trim(to_char(p_date, 'FMDay, FMMonth FMDD')) || '.';
  end if;
  full_description := concat_ws(' ',
    schedule,
    'Time: ' || btrim(p_time) || '.',
    'Cost: ' || btrim(p_cost) || '.',
    case when nullif(btrim(coalesce(p_venue_address, '')), '') is not null then 'Where: ' || btrim(p_venue_address) || '.' end,
    nullif(btrim(coalesce(p_notes, '')), ''),
    case when nullif(btrim(coalesce(p_contact, '')), '') is not null then 'Contact: ' || btrim(p_contact) || '.' end,
    'Posted by a Steer Me member. Call or text the host before you haul, because practice times can change.'
  );

  insert into public.events (
    producer_id, posted_by_user_id, posted_by_admin, status, is_practice, is_clinic, divisions, division_details,
    name, event_date, event_end_date, location, entry_fee, description, external_producer_name,
    producer_contact_info, entry_method, entry_phone
  ) values (
    null, uid, false, 'published', true, false, array[19]::numeric(3,1)[], null,
    btrim(p_name), p_date, case when coalesce(p_weekly, false) then p_end_date end, btrim(p_location), btrim(p_cost),
    full_description, btrim(p_host),
    nullif(btrim(coalesce(p_contact, '')), ''), p_entry_method, case when p_entry_method is not null then btrim(p_entry_phone) end
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.remove_user_practice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events set status = 'removed'
   where id = p_id and posted_by_user_id = auth.uid() and is_practice and status = 'published';
  if not found then
    raise exception 'That practice is not yours, or it is already down.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.create_user_practice(text, text, text, text, date, boolean, date, text, text, text, text, text, text) from public, anon;
revoke all on function public.remove_user_practice(uuid) from public, anon;
grant execute on function public.create_user_practice(text, text, text, text, date, boolean, date, text, text, text, text, text, text) to authenticated;
grant execute on function public.remove_user_practice(uuid) to authenticated;
-- The helpers are internal.
revoke all on function public.practice_check_inputs(text, text, text, text, date, boolean, date, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.practice_text_problem(text) from public, anon, authenticated;
