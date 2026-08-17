-- Real business concept confirmed directly by the producer (ropingtools.com
-- / Draw Pro): a manual pairing can knowingly assign someone an "extra
-- run" beyond what they already paid for (see Draw Pro's own
-- matching-engine.jsw manualPairEntrants() comment for the full
-- reasoning - headerIsExtraRun/heelerIsExtraRun on DrawProTeams). The
-- affected entrant needs to be told and given a real choice: pay the
-- extra entry fee, or decline it and take a reduced share of winnings.
-- Draw Pro doesn't track payouts/winnings at all, so this table only
-- tracks the CHOICE itself - Draw Pro handles the fee-collection or
-- winnings-adjustment consequence on its own side once it reads the
-- decision back (see the status-lookup addition to
-- draw-pro-results-webhook).
create table public.draw_pro_extra_run_charges (
  id uuid primary key default gen_random_uuid(),
  entry_link_team_id uuid not null references public.draw_pro_entry_link_teams(id) on delete cascade,
  fee_amount numeric(8,2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  -- One charge per team assignment - if Draw Pro's webhook call fires more
  -- than once for the same team (e.g. a retried request), it should not
  -- create a second pending charge the user has to make sense of.
  unique (entry_link_team_id)
);

comment on table public.draw_pro_extra_run_charges is
  'Tracks a Steer Me user''s pay/decline choice for an "extra run" - a '
  'team assignment beyond what they already paid for on the Draw Pro '
  'side. Created by draw-pro-results-webhook when Draw Pro flags a team '
  'as headerIsExtraRun/heelerIsExtraRun for a linked entrant. The choice '
  'itself is made via the choose_extra_run_payment() RPC below, then read '
  'back by Draw Pro via the webhook''s status-lookup action - Draw Pro, '
  'not this table, is the source of truth for whether the fee was '
  'actually collected or winnings were actually reduced.';

alter table public.draw_pro_extra_run_charges enable row level security;

-- Read-only for the owning user - see choose_extra_run_payment() below for
-- the only way an authenticated user can change a row's status. No direct
-- insert/update policy for authenticated users, same "service-role and
-- SECURITY DEFINER only" pattern as draw_pro_entry_links/
-- draw_pro_entry_link_teams.
create policy "draw_pro_extra_run_charges_select_own" on public.draw_pro_extra_run_charges
  for select using (
    exists (
      select 1 from public.draw_pro_entry_link_teams t
      join public.draw_pro_entry_links l on l.id = t.entry_link_id
      where t.id = entry_link_team_id and l.steer_me_user_id = auth.uid()
    )
  );

-- The one write path an authenticated user has: their own one-time choice
-- on a still-pending charge. Modeled directly on create_entry_handoff()'s
-- SECURITY DEFINER + explicit ownership check pattern (migration 0036).
create or replace function public.choose_extra_run_payment(p_charge_id uuid, p_decision text)
returns public.draw_pro_extra_run_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.draw_pro_extra_run_charges;
  v_owner uuid;
begin
  if p_decision not in ('paid', 'declined') then
    raise exception 'decision must be ''paid'' or ''declined''';
  end if;

  select l.steer_me_user_id into v_owner
  from public.draw_pro_extra_run_charges c
  join public.draw_pro_entry_link_teams t on t.id = c.entry_link_team_id
  join public.draw_pro_entry_links l on l.id = t.entry_link_id
  where c.id = p_charge_id;

  if v_owner is null then
    raise exception 'Charge not found.';
  end if;
  if v_owner != auth.uid() then
    raise exception 'Not authorized to decide this charge.';
  end if;

  update public.draw_pro_extra_run_charges
  set status = p_decision, decided_at = now()
  where id = p_charge_id and status = 'pending'
  returning * into v_row;

  if v_row is null then
    raise exception 'This charge has already been decided or does not exist.';
  end if;

  return v_row;
end;
$$;

grant execute on function public.choose_extra_run_payment(uuid, text) to authenticated;
