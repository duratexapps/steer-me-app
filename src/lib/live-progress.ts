// "Your team is N runs out" for riders who entered a Draw Pro event through
// Steer Me (migration 0089, DOCS/joint-test-runbook.md follow-up). Pure
// functions so the wording is easy to test. Team numbers only.

export type LiveProgressRow = {
  event_id: string;
  draw_pro_class_id: string;
  class_name: string | null;
  class_status: 'not_started' | 'running' | 'complete';
  round: number;
  total_rounds: number | null;
  round_complete: boolean;
  last_roped_team: number | null;
  remaining_order: number[];
  total_active_teams: number | null;
  seq: number;
  updated_at: string;
};

export type Ticker = {
  // The line that matters to this rider.
  headline: string;
  // Where the class is, for context. Null when there is nothing useful to add.
  detail: string | null;
};

function runsOutText(index: number): string {
  if (index === 0) return "Your team is up now";
  if (index === 1) return 'Your team is on deck, 1 run out';
  return `Your team is ${index} runs out`;
}

// teamNumber: this rider's team in that class. Returns null when there is
// nothing to show (class not started, or no live row yet).
// ranThisRound: the card already shows a recorded time for the current round, so
// a team missing from the run order has run (rather than being out).
export function computeTicker(
  row: LiveProgressRow | undefined,
  teamNumber: number | null,
  ranThisRound = false
): Ticker | null {
  if (!row || teamNumber == null) return null;
  if (row.class_status === 'not_started') return null;
  if (row.class_status === 'complete') {
    return { headline: 'This class is finished', detail: null };
  }

  const roundLabel = row.total_rounds ? `Round ${row.round} of ${row.total_rounds}` : `Round ${row.round}`;
  const upNow = row.remaining_order.length > 0 ? row.remaining_order[0] : null;
  const detailParts = [roundLabel];
  if (upNow != null) detailParts.push(`Team ${upNow} up now`);
  else if (row.round_complete) detailParts.push('round complete');
  if (row.last_roped_team != null) detailParts.push(`last roped Team ${row.last_roped_team}`);
  const detail = detailParts.join(' · ');

  const index = row.remaining_order.indexOf(teamNumber);
  if (index >= 0) return { headline: runsOutText(index), detail };
  // Not in the list of teams still to run this round: it has run, or it is out.
  return {
    headline: ranThisRound ? 'Your team has run this round' : "Your team isn't in this round's run order",
    detail,
  };
}
