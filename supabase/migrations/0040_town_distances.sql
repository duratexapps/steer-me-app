-- Real ask, directly from the user: let a Browse/Events user filter out
-- events farther than they're willing to drive - and, per direct
-- correction, using REAL driven miles, not straight-line distance
-- (a large state like Texas can have an in-state event that's actually
-- farther to drive to than an out-of-state one).
--
-- This table is a cache, not a live lookup - real driving distance
-- between two towns never changes, so it's computed once (via the
-- get-town-distance Edge Function, calling Google's Distance Matrix
-- API) and reused forever after. Keeps ongoing API cost/latency near
-- zero regardless of how many people use the filter - only genuinely
-- NEW town pairs ever hit the real API.
--
-- origin/destination are plain "City, ST" labels - the exact same
-- format both profiles.home_area (AutocompleteField) and events.location
-- already use, so no separate geocoding dataset is needed - Google's
-- Distance Matrix API accepts and geocodes these strings directly.
create table public.town_distances (
  id uuid primary key default gen_random_uuid(),
  origin_town text not null,
  destination_town text not null,
  miles numeric(6,1) not null,
  created_at timestamptz not null default now()
);

comment on table public.town_distances is
  'Cached driving-distance results between two "City, ST" towns, from '
  'Google''s Distance Matrix API - see get-town-distance Edge Function. '
  'Real road distance between two fixed points never changes, so this '
  'is written once per pair and never updated.';

-- Real driving distance is very slightly asymmetric in practice (one-way
-- roads, different highway ramps each direction), but that difference is
-- immaterial for a travel-distance FILTER (not turn-by-turn navigation) -
-- treating (A,B) and (B,A) as the same cached pair halves real API calls
-- for no meaningful accuracy cost. get-town-distance always looks up
-- and stores using alphabetically-sorted (origin, destination), never
-- the "home town first" order a caller might naturally pass in.
create unique index town_distances_pair_unique on public.town_distances (origin_town, destination_town);

alter table public.town_distances enable row level security;

-- Public read - these are just numeric distances between two towns, no
-- PII, and letting the client try a direct cache-hit read first (before
-- ever calling the Edge Function) is what keeps most lookups fast and
-- free once the cache has warmed up for popular towns.
create policy "town_distances_select_all" on public.town_distances
  for select using (true);

-- No insert/update/delete policy - only get-town-distance (service role,
-- bypasses RLS) ever writes to this table.
