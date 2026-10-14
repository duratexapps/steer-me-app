// One My Entries card per entry, with one section per drawn team. When a Draw Pro
// entry produces more than one team (an extra run, or a two-run draw-in), each
// additional team's row copies the entry code, pay link, entry type and run count
// from its parent, so drawing a whole card per row repeated all of that. Rows that
// share event + class + entry code belong to the same entry and are grouped; the
// first row (oldest, lowest team number) is the primary. Pure function, order kept.

import type { DrawProEntry } from '@/src/hooks/useDrawProEntries';

export type EntryGroup = { entry: DrawProEntry; teams: DrawProEntry[] };

export function groupEntries(entries: DrawProEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  const byKey = new Map<string, EntryGroup>();
  for (const e of entries) {
    const groupable = e.entry_code != null && e.draw_pro_class_id != null && e.team_number != null;
    if (!groupable) {
      groups.push({ entry: e, teams: [e] });
      continue;
    }
    const key = `${e.event_id}|${e.draw_pro_class_id}|${e.entry_code}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.teams.push(e);
    } else {
      const g: EntryGroup = { entry: e, teams: [e] };
      byKey.set(key, g);
      groups.push(g);
    }
  }
  for (const g of groups) {
    if (g.teams.length > 1) {
      g.teams.sort(
        (a, b) =>
          a.submitted_at.localeCompare(b.submitted_at) || (a.team_number ?? 0) - (b.team_number ?? 0)
      );
      // The paid status is stored on the row Draw Pro marked, which may not be the first
      // team (live data: paid sat on team 2 while team 1 had none). Show the entry-level
      // status from any team: paid beats left-out beats nothing.
      const status = g.teams.some((t) => t.draw_pro_status === 'paid')
        ? 'paid'
        : g.teams.find((t) => t.draw_pro_status != null)?.draw_pro_status ?? null;
      g.entry = { ...g.teams[0], draw_pro_status: status };
    }
  }
  return groups;
}
