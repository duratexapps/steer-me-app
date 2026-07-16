// The entire eligibility algorithm: for a roping with cap C, a header's
// eligible heelers (or vice versa) are anyone in the OPPOSITE position whose
// classification number is <= (C - my number). Mirrors the prototype's
// neededOppositePosition()/eligiblePartners() exactly.
export function neededOppositePosition(position: 'Header' | 'Heeler') {
  return position === 'Header' ? 'Heeler' : 'Header';
}

export function maxAllowedFor(cap: number, myNumber: number) {
  return Math.round((cap - myNumber) * 10) / 10;
}

export const COMMON_CAPS = [
  3, 4, 4.5, 5, 5.5, 6, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5,
];

// "Open" is an industry term, not a real restriction: the highest a header
// can be rated is a 9 and the highest a heeler can be rated is a 10, so a
// #19 team is already the maximum possible combination under the numbering
// system. Modeling Open as a cap of 19 makes the existing eligibility math
// (cap - my number) naturally resolve to "everyone in the opposite
// position qualifies" without any special-cased logic.
export const OPEN_CAP = 19;

export const MAX_HEADER_NUMBER = 9;
export const MAX_HEELER_NUMBER = 10;

// The full set of valid selectable options, in order - Create Event reuses
// this exact list so a producer can never introduce a division that isn't
// also selectable on Post a Need (e.g. a bare "12" or "15", or a "20" -
// there's no roping above a #19 team; anything at or above that cap enters
// Open instead).
export const DIVISION_OPTIONS = [...COMMON_CAPS, OPEN_CAP];

// Every screen that displays a division number (event cards, posted needs,
// My Requests) needs to show "Open" instead of the literal 19 - centralized
// here so that mapping only exists in one place.
export function formatDivision(division: number | null, isGoatRoping?: boolean) {
  if (isGoatRoping) return 'Goat Roping';
  if (division == null) return '';
  return division === OPEN_CAP ? 'Open' : `#${division}`;
}
