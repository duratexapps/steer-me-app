-- Adds "Switch Ender" as a third self-designation alongside Header/Heeler,
-- per user request: some ropers head, some heel, some rope both ends. The
-- classification-cap math (cap - my number = max partner number allowed)
-- only ever depends on the SUM of both people's numbers, never on which
-- end is labeled which - so the only real constraint on pairing is "not
-- both exclusively the same end." A Switch Ender is compatible with
-- everyone, including another Switch Ender (between two flexible ropers,
-- either can take either end and the math comes out the same either way).
-- That single rule (see canPair() in src/lib/matching.ts) replaces the old
-- strict "opposite position" check everywhere, with no new per-request
-- role declaration needed.

alter table public.profiles
  drop constraint profiles_position_check;

alter table public.profiles
  add constraint profiles_position_check
    check ("position" in ('Header', 'Heeler', 'Switch'));
