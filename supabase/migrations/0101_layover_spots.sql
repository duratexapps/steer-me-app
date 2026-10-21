-- Layover finder: places a person hauling horses can stop overnight, plus members-only access to the travel tools.
--
-- layover_spots is curated data, edited only by service-role scripts / the SQL editor (like travel_rules), so a
-- correction is a data edit, not an app release. Every row carries a source, the date it was last checked and
-- whether anyone has actually confirmed it with the facility. `unverified` is the honest default; the page says so.
--
-- Access: free for REGISTERED Steer Me members only. Reads need a signed-in user (role authenticated), enforced
-- here and not just in the screen. This also closes the public read on the paperwork tables (travel_*), which the
-- page used to serve to anyone: the paperwork checker is now members-only too.
--
-- Usage logging for both tools stays anonymous: log_feature_event no longer records the signed-in user at all
-- (it used auth.uid() only because the page used to be public).

create table public.layover_spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('fairgrounds', 'equestrian_center', 'boarding_barn', 'arena', 'campground')),
  state text not null check (state ~ '^[A-Z]{2}$'),
  city text not null,
  address text,
  lat numeric(8, 5) not null,                 -- city-level is fine; used only to order stops and estimate distance between them
  lng numeric(8, 5) not null,
  phone text,
  website text,
  has_stalls boolean not null default false,
  has_pens boolean not null default false,
  housing_detail text,                        -- stall/pen size, count, nightly price, bedding and hay if known
  rv_hookups boolean not null default false,
  rv_detail text,                             -- amps, water, dump station, pull-through, longest rig
  requirements text,                          -- Coggins / health certificate, reservation rules, check-in hours
  season_note text,                           -- closed or full at certain times, event conflicts
  notes text,
  verification text not null default 'unverified' check (verification in ('unverified', 'confirmed')),
  confirmed_on date,                          -- when someone last confirmed it with the facility
  source_name text not null,
  source_url text not null,
  verified_on date not null,                  -- when the listing was last checked against its source
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index layover_spots_state on public.layover_spots (state) where active;

alter table public.layover_spots enable row level security;
create policy "layover_spots_read_members" on public.layover_spots for select to authenticated using (active);

-- Paperwork tables: signed-in members only.
drop policy "travel_states_read" on public.travel_states;
drop policy "travel_rules_read" on public.travel_rules;
drop policy "travel_alerts_read" on public.travel_alerts;
create policy "travel_states_read" on public.travel_states for select to authenticated using (true);
create policy "travel_rules_read" on public.travel_rules for select to authenticated
  using (active and (effective_until is null or effective_until >= current_date) and (effective_from is null or effective_from <= current_date));
create policy "travel_alerts_read" on public.travel_alerts for select to authenticated
  using (active and (effective_until is null or effective_until >= current_date) and (effective_from is null or effective_from <= current_date));

-- Anonymous usage counts for both tools. 'gate_shown' counts a signed-out visitor who met the sign-in wall.
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
  insert into public.feature_events (feature, event, props, visitor_id, user_id)
  values (p_feature, p_event, coalesce(p_props, '{}'::jsonb), left(p_visitor, 64), null);
end;
$$;
