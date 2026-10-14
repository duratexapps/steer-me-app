// Compact per-team round list for My Entries (replaces the separate team pill, Live
// banner, standing box and results block). One row per round that has started:
// "12 away" until the producer's Draw Pro logs the time, then the time itself. A new
// round row appears only when that round begins. Pure function so the wording is easy
// to test. Positions come from the live run order (migration 0089); results from the
// team's round results.

import type { LiveProgressRow } from '@/src/lib/live-progress';
import type { DrawProRoundResult } from '@/src/hooks/useDrawProEntries';

export type RoundRowKind = 'time' | 'no_time' | 'up_now' | 'on_deck' | 'away' | 'out' | 'not_needed' | 'waiting';

export type RoundRow = {
  round: number;
  kind: RoundRowKind;
  // Display text for the right-hand side, e.g. "6.68s", "12 away", "Up now".
  text: string;
  // Small second line, e.g. "7.3s + 5s (broken barrier)". Null when nothing to add.
  note: string | null;
  // Small text beside the time, e.g. "1st of 14". Only on the row the standing is after.
  standing: string | null;
};

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'];
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

export function buildRoundRows(
  team: {
    team_number: number | null;
    results: DrawProRoundResult[];
    standing_rank: number | null;
    standing_of: number | null;
    standing_round: number | null;
  },
  live: LiveProgressRow | undefined
): RoundRow[] {
  if (team.team_number == null) return [];

  const finished = live?.class_status === 'complete';
  const maxResultRound = team.results.reduce((m, r) => Math.max(m, r.round), 0);
  // Which round is happening now. With no live data yet, show round 1 (or the latest
  // round the team already has a result for).
  const currentRound = finished
    ? Math.max(live?.total_rounds ?? 0, live?.round ?? 0, maxResultRound, 1)
    : Math.max(live?.round ?? 1, maxResultRound, 1);

  const rows: RoundRow[] = [];
  for (let round = 1; round <= currentRound; round++) {
    const result = team.results.find((r) => r.round === round);
    const standing =
      team.standing_rank != null && team.standing_round === round
        ? `${ordinal(team.standing_rank)}${team.standing_of != null ? ` of ${team.standing_of}` : ''}`
        : null;

    if (result) {
      if (result.no_time) {
        rows.push({ round, kind: 'no_time', text: 'No time', note: null, standing });
        continue;
      }
      const notes: string[] = [];
      if (result.broken_barrier) notes.push('broken barrier');
      if (result.one_leg_catch) notes.push('one-leg catch');
      rows.push({
        round,
        kind: 'time',
        text: result.final_time != null ? `${result.final_time}s` : '—',
        note:
          notes.length > 0 && result.raw_time != null
            ? `${result.raw_time}s + ${result.penalty_seconds}s (${notes.join(', ')})`
            : null,
        standing,
      });
      continue;
    }

    // No time logged for this round yet.
    const isCurrent = round === currentRound && !finished;
    if (!isCurrent) {
      // A round that already ended without a time for this team: it was out by then.
      rows.push({ round, kind: 'out', text: 'Out', note: null, standing: null });
      continue;
    }

    if (!live || live.class_status === 'not_started') {
      rows.push({ round, kind: 'waiting', text: 'Not started', note: null, standing: null });
      continue;
    }
    if ((live.skipped_teams ?? []).includes(team.team_number)) {
      rows.push({ round, kind: 'not_needed', text: 'Not needed', note: null, standing: null });
      continue;
    }
    const index = live.remaining_order.indexOf(team.team_number);
    if (index < 0) {
      rows.push({ round, kind: 'out', text: 'Out', note: null, standing: null });
    } else if (index === 0) {
      rows.push({ round, kind: 'up_now', text: 'Up now', note: null, standing: null });
    } else if (index === 1) {
      rows.push({ round, kind: 'on_deck', text: 'On deck', note: null, standing: null });
    } else {
      rows.push({ round, kind: 'away', text: `${index} away`, note: null, standing: null });
    }
  }
  return rows;
}
