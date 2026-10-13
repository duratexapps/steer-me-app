// "Save my results": plain text an athlete can share to Notes, Messages, email or
// a keep-forever app. Pure function so the wording is easy to test. Only the
// athlete's own entry is included: event, class, team number, the partner shown on
// the card, each round, and the latest standing. Never the entry code or pay link.

import type { DrawProEntry } from '@/src/hooks/useDrawProEntries';

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'];
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function hasSavableResults(entry: Pick<DrawProEntry, 'team_number' | 'results' | 'standing_rank'>): boolean {
  return entry.team_number != null && (entry.results.length > 0 || entry.standing_rank != null);
}

export function buildResultsText(
  entry: Pick<
    DrawProEntry,
    | 'event_name'
    | 'event_date'
    | 'draw_pro_class_name'
    | 'team_number'
    | 'total_teams'
    | 'entry_type'
    | 'partner_name'
    | 'partner_classification_number'
    | 'results'
    | 'standing_rank'
    | 'standing_of'
    | 'standing_round'
  >
): string {
  const lines: string[] = [];
  lines.push(entry.event_name);
  if (entry.event_date) lines.push(formatDate(entry.event_date));
  if (entry.draw_pro_class_name) lines.push(`Class: ${entry.draw_pro_class_name}`);
  if (entry.team_number != null) {
    lines.push(`Team #${entry.team_number}${entry.total_teams != null ? ` of ${entry.total_teams}` : ''}`);
  }
  if (entry.partner_name) {
    const cls = entry.partner_classification_number != null ? ` (${entry.partner_classification_number})` : '';
    lines.push(`Partner: ${entry.partner_name}${cls}`);
  }

  const rounds = [...entry.results].sort((a, b) => a.round - b.round);
  if (rounds.length > 0) {
    lines.push('');
    for (const r of rounds) {
      if (r.no_time) {
        lines.push(`Round ${r.round}: No time`);
        continue;
      }
      const notes: string[] = [];
      if (r.broken_barrier) notes.push('broken barrier');
      if (r.one_leg_catch) notes.push('one-leg catch');
      const time = r.final_time != null ? `${r.final_time}s` : 'no time recorded';
      const detail = notes.length > 0 && r.raw_time != null ? ` (${r.raw_time}s + ${r.penalty_seconds}s: ${notes.join(', ')})` : '';
      lines.push(`Round ${r.round}: ${time}${detail}`);
    }
  }

  if (entry.standing_rank != null) {
    lines.push('');
    lines.push(
      `Standing: ${ordinal(entry.standing_rank)}${entry.standing_of != null ? ` of ${entry.standing_of}` : ''}` +
        `${entry.standing_round != null ? ` after Round ${entry.standing_round}` : ''}`
    );
  }

  lines.push('');
  lines.push('Saved from Steer Me');
  return lines.join('\n');
}
