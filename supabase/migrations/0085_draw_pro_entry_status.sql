-- NEW, 2026-10-11 - Draw Pro tells Steer Me where a pending entry stands, so
-- My Entries can explain silence instead of leaving it blank (decision D1 in
-- DOCS/joint-test-runbook.md). Written by the draw-pro-results-webhook
-- 'entryStatus' action via the service role; read by the owner through the
-- existing RLS select policy.
--   left_out_unpaid  the class is paid-only and this entry was not paid when
--                    the draw ran, so it was left out of the draw
--   paid             the secretary marked the entry paid
-- Null for everything made before this, or when Draw Pro sends nothing.
alter table public.draw_pro_entry_link_teams
  add column draw_pro_status text
    check (draw_pro_status in ('left_out_unpaid', 'paid'));

comment on column public.draw_pro_entry_link_teams.draw_pro_status is
  'Latest status Draw Pro reported for this entry: left_out_unpaid or paid. Null = nothing reported.';
