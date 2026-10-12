-- NEW, 2026-10-11 - save a team's current standing so My Entries can show it.
-- Found in the joint test: the "Round N standings - Nth place" push was the
-- only place a roper could see it, and nobody can watch their phone while
-- they are riding. draw-pro-results-webhook already receives rank and
-- totalActiveTeams with every pushRoundStandings call; it now stores them here
-- (even when the roper has no push token). A later round overwrites an earlier
-- one; an older round never overwrites a newer one.
alter table public.draw_pro_entry_link_teams
  add column standing_rank int,
  add column standing_of int,
  add column standing_round int;

comment on column public.draw_pro_entry_link_teams.standing_rank is
  'Latest overall rank Draw Pro reported for this team (1 = first). Null until a round completes or when the team is unranked.';
comment on column public.draw_pro_entry_link_teams.standing_of is
  'Number of active teams the rank is out of.';
comment on column public.draw_pro_entry_link_teams.standing_round is
  'The round that standing is after.';
