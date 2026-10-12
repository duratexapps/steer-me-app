-- NEW, 2026-10-12 - fastest-first short go. In that format the go ends as soon
-- as the remaining teams cannot beat the Nth best final total, so some teams are
-- SKIPPED: they never get a final-round time. Draw Pro sends their numbers in
-- liveProgress (skippedTeamNumbers, final round only, while the class is
-- running) and the ticker tells those riders their team doesn't need to run,
-- instead of wrongly saying it has run.
alter table public.draw_pro_live_progress
  add column skipped_teams int[] not null default '{}';

drop function if exists public.upsert_draw_pro_live_progress(uuid, text, text, text, int, int, boolean, int, int[], int, bigint);

create function public.upsert_draw_pro_live_progress(
  p_event_id uuid,
  p_class_id text,
  p_class_name text,
  p_class_status text,
  p_round int,
  p_total_rounds int,
  p_round_complete boolean,
  p_last_roped int,
  p_remaining int[],
  p_total_active int,
  p_seq bigint,
  p_skipped int[] default '{}'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  applied int;
begin
  insert into public.draw_pro_live_progress as t
    (event_id, draw_pro_class_id, class_name, class_status, round, total_rounds, round_complete,
     last_roped_team, remaining_order, total_active_teams, skipped_teams, seq, updated_at)
  values
    (p_event_id, p_class_id, p_class_name, p_class_status, p_round, p_total_rounds, p_round_complete,
     p_last_roped, coalesce(p_remaining, '{}'), p_total_active, coalesce(p_skipped, '{}'), p_seq, now())
  on conflict (event_id, draw_pro_class_id) do update set
    class_name = excluded.class_name,
    class_status = excluded.class_status,
    round = excluded.round,
    total_rounds = excluded.total_rounds,
    round_complete = excluded.round_complete,
    last_roped_team = excluded.last_roped_team,
    remaining_order = excluded.remaining_order,
    total_active_teams = excluded.total_active_teams,
    skipped_teams = excluded.skipped_teams,
    seq = excluded.seq,
    updated_at = now()
  where t.seq < excluded.seq;
  get diagnostics applied = row_count;
  return applied > 0;
end;
$$;

revoke all on function public.upsert_draw_pro_live_progress(uuid, text, text, text, int, int, boolean, int, int[], int, bigint, int[])
  from public, anon, authenticated;
