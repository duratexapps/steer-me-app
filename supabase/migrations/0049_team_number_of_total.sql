-- Real gap flagged directly by the user: "Team #54" tells an entrant
-- nothing about how big the field is. Draw Pro already knows the total
-- team count for a class the moment teams are pushed (it's just the
-- current row count in DrawProTeams for that class) - this just carries
-- that number alongside team_number so Steer Me can show "Team #54 of
-- 157" instead of a bare number. Nullable/backfill-free: existing rows
-- simply show without the "of N" suffix until a future push (e.g. a
-- round result or extra-run update) happens to include it - team_number
-- itself is never recomputed just to backfill this.

alter table public.draw_pro_entry_link_teams
  add column total_teams integer;
