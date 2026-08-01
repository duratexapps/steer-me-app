-- Round-by-round results for a draw_pro_entry_links row (migration 0042),
-- pushed here by Draw Pro's backend/steerMeResultsSync.jsw whenever a
-- producer saves a round's results on Producer Draw Sheet Review (see
-- ropingtools-site's backend/roundResults.jsw). Draw Pro computes
-- penaltySeconds/finalTime itself (it owns the barrier-type/penalty
-- business rules) and sends the full breakdown here for transparent
-- display - this table never recomputes anything, just stores what Draw
-- Pro already decided.
create table public.draw_pro_round_results (
  id uuid primary key default gen_random_uuid(),
  entry_link_id uuid not null references public.draw_pro_entry_links(id) on delete cascade,
  round int not null check (round >= 1),
  no_time boolean not null default false,
  raw_time numeric(6,2),
  broken_barrier boolean not null default false,
  one_leg_catch boolean not null default false,
  penalty_seconds numeric(4,1) not null default 0,
  final_time numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (entry_link_id, round)
);

comment on table public.draw_pro_round_results is
  'Round-by-round results (time, penalties, no-time eliminations) pushed '
  'by Draw Pro''s backend/steerMeResultsSync.jsw once a producer saves a '
  'round on Producer Draw Sheet Review. One row per (entry_link, round) - '
  'upserted, not append-only, so a producer correcting a mistyped time '
  'just overwrites the same row.';

create trigger draw_pro_round_results_set_updated_at
  before update on public.draw_pro_round_results
  for each row execute function public.set_updated_at();

-- Same access shape as draw_pro_entry_links: select-only via a join back
-- to the owning link's steer_me_user_id, no client insert/update/delete
-- policy at all - every write comes from draw-pro-results-webhook's
-- service-role client, which bypasses RLS by design.
alter table public.draw_pro_round_results enable row level security;

create policy "draw_pro_round_results_select_own" on public.draw_pro_round_results
  for select using (
    exists (
      select 1 from public.draw_pro_entry_links l
      where l.id = entry_link_id and l.steer_me_user_id = auth.uid()
    )
  );
