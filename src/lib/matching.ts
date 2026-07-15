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

export const COMMON_CAPS = [10, 10.5, 11, 12, 13, 15];
