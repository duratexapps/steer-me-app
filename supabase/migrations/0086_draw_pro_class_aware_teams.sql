-- NEW, 2026-10-11 - make Draw Pro teams class-aware. Found in the joint test
-- (DOCS/joint-test-runbook.md): Draw Pro numbers teams PER CLASS, restarting at
-- 1, but draw_pro_entry_link_teams was unique on (entry_link_id, team_number)
-- and a link is one per (user, event) with no class dimension. A roper in two
-- classes at one event whose team numbers matched lost the second team (the
-- webhook hit the unique constraint and returned 500 before any push). The
-- team-assignment push also listed teams from every class with no class name.
--
-- Draw Pro will send classId + className (optional). Rows with no class (made
-- before this, or by a call that omits it) keep the old uniqueness among
-- themselves.
alter table public.draw_pro_entry_link_teams
  add column draw_pro_class_id text,
  add column draw_pro_class_name text;

comment on column public.draw_pro_entry_link_teams.draw_pro_class_id is
  'Stable Draw Pro class id the team belongs to. Null for rows made before class-aware teams.';
comment on column public.draw_pro_entry_link_teams.draw_pro_class_name is
  'Class label shown to the roper (for example #ZZ-B). Display only.';

-- Drop the old unique (entry_link_id, team_number) whatever it is named.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.draw_pro_entry_link_teams'::regclass
      and con.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from pg_attribute a
        where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      ) = array['entry_link_id', 'team_number']
  loop
    execute format('alter table public.draw_pro_entry_link_teams drop constraint %I', c.conname);
  end loop;
end
$$;

create unique index draw_pro_entry_link_teams_legacy_team_key
  on public.draw_pro_entry_link_teams (entry_link_id, team_number)
  where draw_pro_class_id is null and team_number is not null;

create unique index draw_pro_entry_link_teams_class_team_key
  on public.draw_pro_entry_link_teams (entry_link_id, draw_pro_class_id, team_number)
  where draw_pro_class_id is not null and team_number is not null;

-- register_draw_pro_entry_submission gains p_class_id / p_class_name. Bad
-- values are stored as null; they must never block an entry.
drop function if exists public.register_draw_pro_entry_submission(text, text, int, text, text);

create function public.register_draw_pro_entry_submission(
  p_token text,
  p_entry_type text,
  p_requested_run_count int,
  p_entry_code text default null,
  p_pay_url text default null,
  p_class_id text default null,
  p_class_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.draw_pro_entry_links;
  new_id uuid;
  v_code text := null;
  v_pay text := null;
  v_class_id text := null;
  v_class_name text := null;
begin
  if p_entry_type not in ('draw_in', 'preformed_team') then
    raise exception 'Invalid entry_type';
  end if;

  select * into link from public.draw_pro_entry_links where token = p_token;
  if link is null then
    raise exception 'Entry link not found for token';
  end if;

  if p_entry_code is not null and upper(p_entry_code) ~ '^[A-Z0-9]{3,8}$' then
    v_code := upper(p_entry_code);
  end if;
  if p_pay_url is not null and p_pay_url ~ '^https://(www\.)?ropingtools\.com/pay/[A-Za-z0-9_-]{10,200}$' then
    v_pay := p_pay_url;
  end if;
  if p_class_id is not null and p_class_id ~ '^[A-Za-z0-9_-]{1,64}$' then
    v_class_id := p_class_id;
  end if;
  if p_class_name is not null and length(btrim(p_class_name)) > 0 then
    v_class_name := left(btrim(p_class_name), 60);
  end if;

  insert into public.draw_pro_entry_link_teams
    (entry_link_id, entry_type, requested_run_count, entry_code, pay_url, draw_pro_class_id, draw_pro_class_name)
  values
    (link.id, p_entry_type, greatest(1, coalesce(p_requested_run_count, 1)), v_code, v_pay, v_class_id, v_class_name)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.register_draw_pro_entry_submission(text, text, int, text, text, text, text)
  from public, anon, authenticated;
