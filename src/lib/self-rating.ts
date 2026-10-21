// Sign-up questions for ropers WITHOUT a Global card, and a consistency check on the number they claim.
//
// This is Steer Me's own tool, not Global's, and it does NOT assign a rating. It turns the answers into a
// suggested range (modeled on the things Global weighs: classes entered, money won, catch rate, results)
// and tells the roper when the number they typed looks low for what they said. It never blocks anyone;
// producers can reclassify at entry. Pure functions so the wording and the math are easy to test.

import { MAX_HEADER_NUMBER, MAX_HEELER_NUMBER, type Position } from '@/src/lib/matching';

export type MoneyWon = 'never' | 'a_few' | 'often';
export type WinVsSpend = 'yes' | 'even' | 'no';
export type RopingsPerMonth = '0-1' | '2-3' | '4-8' | '9+';

export type SelfAssessment = {
  // The biggest team class entered in the last 12 months, as the roping's total (e.g. 9.5 for a #9.5).
  highestClassEntered: number | null;
  ropingsPerMonth: RopingsPerMonth | null;
  moneyWon: MoneyWon | null;
  // Out of 10 jackpot runs, roughly how many are catches.
  catchOutOf10: number | null;
  winMoreThanSpend: WinVsSpend | null;
  // Highest number any organization has given them, and roughly how many years ago.
  priorNumber: number | null;
  priorNumberYearsAgo: number | null;
  yearsRoping: number | null;
  // Optional names of ropers or producers who know their roping (as on the WSTR form).
  references: string[];
};

export const EMPTY_ASSESSMENT: SelfAssessment = {
  highestClassEntered: null,
  ropingsPerMonth: null,
  moneyWon: null,
  catchOutOf10: null,
  winMoreThanSpend: null,
  priorNumber: null,
  priorNumberYearsAgo: null,
  yearsRoping: null,
  references: [],
};

export const CLASS_CHOICES = [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 19];

const round05 = (n: number) => Math.round(n * 2) / 2;

export type SuggestedRange = { low: number; high: number };

// A team in a #X roping averages X/2 per roper, so a roper who regularly enters up to #X is rarely far below
// X/2 - 1.5. Results nudge it up or down. Everything is clamped to the real range for the roper's end.
export function suggestRange(a: SelfAssessment, position: Position): SuggestedRange | null {
  const max = position === 'Header' ? MAX_HEADER_NUMBER : MAX_HEELER_NUMBER;
  if (a.highestClassEntered == null && a.priorNumber == null) return null;

  let floor = a.highestClassEntered != null ? a.highestClassEntered / 2 - 1.5 : 1;

  if (a.moneyWon === 'often') floor += 0.5;
  if (a.winMoreThanSpend === 'yes') floor += 0.5;
  if (a.winMoreThanSpend === 'no') floor -= 0.25;
  if (a.catchOutOf10 != null) {
    if (a.catchOutOf10 >= 8) floor += 0.5;
    else if (a.catchOutOf10 <= 3) floor -= 0.5;
  }
  if (a.ropingsPerMonth === '9+') floor += 0.25;

  // A number any organization gave them in the last three years is the strongest clue.
  if (a.priorNumber != null && (a.priorNumberYearsAgo ?? 99) <= 3) {
    floor = Math.max(floor, a.priorNumber - 1);
  }

  const low = Math.min(max, Math.max(1, round05(floor)));
  const high = Math.min(max, low + 2.5);
  return { low, high };
}

export type ClaimCheck = {
  status: 'consistent' | 'low' | 'unknown';
  suggested: SuggestedRange | null;
  message: string | null;
};

// claimed: the number they typed for their end (for a Switch Ender, call once per end).
export function checkClaim(claimed: number, a: SelfAssessment, position: Position): ClaimCheck {
  const suggested = suggestRange(a, position);
  if (!suggested) return { status: 'unknown', suggested: null, message: null };
  if (claimed < suggested.low - 0.5) {
    return {
      status: 'low',
      suggested,
      message:
        `Your answers suggest about ${suggested.low} to ${suggested.high}, and you entered ${claimed}. ` +
        'A number that is too low can get a team reclassified or voided at the gate. You can continue, and partners will see Self-reported.',
    };
  }
  return { status: 'consistent', suggested, message: null };
}

export const SELF_REPORTED_DISCLAIMER =
  "Your number is your own claim until a producer confirms it, and producers can reclassify you at any time. Steer Me's check is its own, not Global's.";
