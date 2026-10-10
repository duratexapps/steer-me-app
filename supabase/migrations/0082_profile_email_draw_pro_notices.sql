-- NEW, 2026-10-09 - the Steer Me half of the Draw Pro "email me my team
-- number" backup (see DOCS/steer-me-draw-pro-email-backup-toggle-handoff.md).
-- Draw Pro now emails a team number only to entrants who did NOT come in
-- through Steer Me, because Steer Me already pushes it at sign-off. This
-- opt-in lets a Steer Me entrant ask for the email as well.
--
-- The column name and type are a contract: Draw Pro selects
-- profiles.email_draw_pro_notices by exactly this name through the service
-- role, and treats a missing column as "nobody opted in". Additive and safe
-- to ship on its own. Users update their own profile row already (same path
-- as auto_cancel_team_entry_on_partner_cancel), so no new RLS policy.
alter table public.profiles
  add column email_draw_pro_notices boolean not null default false;

comment on column public.profiles.email_draw_pro_notices is
  'When true, Draw Pro also emails this user their team number (a backup to the in-app push). Read by Draw Pro''s notify route through the service role. Default false: the in-app push is the primary channel.';
