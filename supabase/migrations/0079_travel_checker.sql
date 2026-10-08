-- Hauling-paperwork checker (public web page /travel) and light feature-usage logging.
--
-- travel_states / travel_rules / travel_alerts are public READ (the page works with no login) and are edited only
-- by service-role scripts or the SQL editor, so rules can be corrected in minutes with no app release. Every rule
-- carries a source and a verified_on date; the page shows both. A rule with effective_until in the past drops off
-- by itself (outbreak rules are temporary).
--
-- feature_events: anonymous usage counts so we can tell whether a feature is sticky before building more.
-- Written only through log_feature_event() (validated, allow-listed), never readable by the app.

create table public.travel_states (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  office_name text,
  office_url text,
  office_phone text,
  office_email text
);

create table public.travel_rules (
  id uuid primary key default gen_random_uuid(),
  state text not null check (state = 'US' or state ~ '^[A-Z]{2}$'),     -- 'US' = applies to every route
  species text not null check (species in ('horse', 'cattle', 'both')),
  applies text not null check (applies in ('entering', 'leaving', 'transit')),
  kind text not null check (kind in ('required', 'conditional', 'check')),
  title text not null,
  window_text text,
  detail text not null,
  confidence text not null check (confidence in ('official', 'secondary')),
  source_name text not null,
  source_url text not null,
  verified_on date not null,
  effective_from date,
  effective_until date,
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index travel_rules_lookup on public.travel_rules (state, species, applies) where active;

create table public.travel_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nws', 'vs', 'ehv', 'other')),
  title text not null,
  body text not null,
  states text[] not null,                 -- shown when the route touches any of these states
  source_name text not null,
  source_url text not null,
  verified_on date not null,
  effective_from date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.travel_states enable row level security;
alter table public.travel_rules enable row level security;
alter table public.travel_alerts enable row level security;
create policy "travel_states_read" on public.travel_states for select to anon, authenticated using (true);
create policy "travel_rules_read" on public.travel_rules for select to anon, authenticated
  using (active and (effective_until is null or effective_until >= current_date) and (effective_from is null or effective_from <= current_date));
create policy "travel_alerts_read" on public.travel_alerts for select to anon, authenticated
  using (active and (effective_until is null or effective_until >= current_date) and (effective_from is null or effective_from <= current_date));

create table public.feature_events (
  id bigint generated always as identity primary key,
  feature text not null,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  visitor_id text,                 -- random id kept in the visitor's own browser; not an account id
  user_id uuid,
  created_at timestamptz not null default now()
);
create index feature_events_feature_time on public.feature_events (feature, created_at desc);
alter table public.feature_events enable row level security;   -- no policies: service role only

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
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), auth.uid());
end;
$$;
revoke all on function public.log_feature_event(text, text, jsonb, text) from public;
grant execute on function public.log_feature_event(text, text, jsonb, text) to anon, authenticated;
