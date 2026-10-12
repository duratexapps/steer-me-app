-- NEW, 2026-10-12 - live progress ("your team is N runs out") for riders who
-- entered a Draw Pro event through Steer Me (Tier C of the follow/live study).
-- One row per (event, Draw Pro class), written only by the webhook's
-- 'liveProgress' action; Draw Pro sends the order of teams still to run in the
-- current round. Team numbers only: no names, no contact info.
--
-- Readable only by users who entered that event through Steer Me (entering is
-- the consent for the ticker on their own card). Opt-in public following, for
-- later tiers, needs its own policy and an events flag.
create table public.draw_pro_live_progress (
  event_id uuid not null references public.events(id) on delete cascade,
  draw_pro_class_id text not null,
  class_name text,
  class_status text not null check (class_status in ('not_started', 'running', 'complete')),
  round int not null,
  total_rounds int,
  round_complete boolean not null default false,
  last_roped_team int,
  -- Active teams still to run THIS round, in run order. First = up now.
  remaining_order int[] not null default '{}',
  total_active_teams int,
  -- Monotonic per class so a late or repeated update never overwrites newer state.
  seq bigint not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, draw_pro_class_id)
);

alter table public.draw_pro_live_progress enable row level security;

create policy "draw_pro_live_progress_select_entered" on public.draw_pro_live_progress
  for select using (
    exists (
      select 1 from public.draw_pro_entry_links l
      where l.event_id = draw_pro_live_progress.event_id
        and l.steer_me_user_id = auth.uid()
    )
  );

-- Webhook-only upsert that only applies a strictly newer seq (atomic).
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
  p_seq bigint
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
     last_roped_team, remaining_order, total_active_teams, seq, updated_at)
  values
    (p_event_id, p_class_id, p_class_name, p_class_status, p_round, p_total_rounds, p_round_complete,
     p_last_roped, coalesce(p_remaining, '{}'), p_total_active, p_seq, now())
  on conflict (event_id, draw_pro_class_id) do update set
    class_name = excluded.class_name,
    class_status = excluded.class_status,
    round = excluded.round,
    total_rounds = excluded.total_rounds,
    round_complete = excluded.round_complete,
    last_roped_team = excluded.last_roped_team,
    remaining_order = excluded.remaining_order,
    total_active_teams = excluded.total_active_teams,
    seq = excluded.seq,
    updated_at = now()
  where t.seq < excluded.seq;
  get diagnostics applied = row_count;
  return applied > 0;
end;
$$;

revoke all on function public.upsert_draw_pro_live_progress(uuid, text, text, text, int, int, boolean, int, int[], int, bigint)
  from public, anon, authenticated;
