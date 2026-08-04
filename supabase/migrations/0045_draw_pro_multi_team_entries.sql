-- Real gap flagged directly by the producer (ropingtools.com/Draw Pro):
-- draw_pro_entry_links (migration 0042) modeled "one Steer Me user -> one
-- team" with a single team_number column, and draw_pro_round_results
-- (migration 0043) inherited that assumption by keying results on
-- entry_link_id alone. That's wrong for a solo entrant with
-- requestedEntryCount > 1 on the Draw Pro side (see event-setup.jsw) - one
-- person can legitimately end up on several different teams, with
-- different partners, in the same class. This migration replaces the
-- single team_number column with a proper one-to-many table, and re-keys
-- round results onto it. Pre-launch schema, but tonight's own live testing
-- already wrote real draw_pro_round_results rows under the old shape
-- (confirmed live: "column entry_link_team_id ... contains null values"
-- when this migration first tried a bare NOT NULL with no backfill) - so
-- this does a real backfill (old team_number -> a new teams row -> each
-- existing result repointed at it) rather than assuming the tables were
-- empty.

create table public.draw_pro_entry_link_teams (
  id uuid primary key default gen_random_uuid(),
  entry_link_id uuid not null references public.draw_pro_entry_links(id) on delete cascade,
  team_number int not null,
  -- Partner snapshot at team-assignment time, not a live reference to a
  -- Draw Pro entrant record (Draw Pro entrants aren't in this database at
  -- all) - same "Draw Pro computes it, this just stores it" idiom already
  -- used for round-results' penalty/final-time fields.
  partner_name text,
  partner_classification_number numeric(4,1),
  partner_role text check (partner_role in ('header', 'heeler')),
  created_at timestamptz not null default now(),

  unique (entry_link_id, team_number)
);

comment on table public.draw_pro_entry_link_teams is
  'One row per team a Steer Me user is drawn onto for a given event - '
  'usually one, but a solo entrant with multiple draw-in slots on the '
  'Draw Pro side can land on several teams with different partners. '
  'Pushed by ropingtools-site backend/steerMeResultsSync.jsw''s '
  'pushTeamNumbers(), upserted by draw-pro-results-webhook.';

alter table public.draw_pro_entry_link_teams enable row level security;

create policy "draw_pro_entry_link_teams_select_own" on public.draw_pro_entry_link_teams
  for select using (
    exists (
      select 1 from public.draw_pro_entry_links l
      where l.id = entry_link_id and l.steer_me_user_id = auth.uid()
    )
  );

-- Backfill: one draw_pro_entry_link_teams row per link that already had a
-- team_number, so existing round results have something to repoint at.
insert into public.draw_pro_entry_link_teams (entry_link_id, team_number)
select id, team_number
from public.draw_pro_entry_links
where team_number is not null
on conflict (entry_link_id, team_number) do nothing;

-- Re-key draw_pro_round_results onto the new per-team row instead of the
-- link directly - a round result belongs to ONE of a person's teams, not
-- to the person/event pair as a whole.
alter table public.draw_pro_round_results
  add column entry_link_team_id uuid references public.draw_pro_entry_link_teams(id) on delete cascade;

update public.draw_pro_round_results r
set entry_link_team_id = t.id
from public.draw_pro_entry_link_teams t
where t.entry_link_id = r.entry_link_id;

-- A round result whose link never had a team_number shouldn't be
-- reachable in practice (results are only ever entered after a team is
-- assigned), but can't be backfilled if it somehow occurred - drop rather
-- than leave orphaned ahead of the NOT NULL below.
delete from public.draw_pro_round_results where entry_link_team_id is null;

alter table public.draw_pro_round_results
  alter column entry_link_team_id set not null;

alter table public.draw_pro_round_results
  drop constraint draw_pro_round_results_entry_link_id_round_key;

alter table public.draw_pro_round_results
  add constraint draw_pro_round_results_entry_link_team_id_round_key unique (entry_link_team_id, round);

drop policy "draw_pro_round_results_select_own" on public.draw_pro_round_results;

create policy "draw_pro_round_results_select_own" on public.draw_pro_round_results
  for select using (
    exists (
      select 1 from public.draw_pro_entry_link_teams t
      join public.draw_pro_entry_links l on l.id = t.entry_link_id
      where t.id = entry_link_team_id and l.steer_me_user_id = auth.uid()
    )
  );

alter table public.draw_pro_round_results drop column entry_link_id;

-- Superseded by draw_pro_entry_link_teams.team_number (one row per team,
-- not one scalar per link).
alter table public.draw_pro_entry_links drop column team_number;
