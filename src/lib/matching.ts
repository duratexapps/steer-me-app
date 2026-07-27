export type Position = 'Header' | 'Heeler' | 'Switch';

// Real bug found live 2026-07-25 (see migration 0030): a Switch Ender
// (someone who ropes both ends) was represented by a SINGLE number used
// for either end, on the assumption that "the math comes out the same
// regardless of who ropes which." That's wrong - header and heeler
// ratings are assessed independently and commonly differ (a real 6.5
// header / 8.0 heeler is a normal combination), and MAX_HEADER_NUMBER
// (9) vs MAX_HEELER_NUMBER (10) below already encoded that headers and
// heelers have different valid ranges even before this fix - a single
// ambiguous number could be invalid for whichever end was actually being
// evaluated. Header/Heeler-only ropers are unaffected - they only ever
// have one real number, for their one real end.
export type Classification = {
  position: Position;
  globalClassification: number | null; // Header/Heeler-only
  headerClassification: number | null; // Switch Ender only
  heelerClassification: number | null; // Switch Ender only
};

// The number this person would rope as A HEADER in a given pairing, or
// null if they have none set up for that end (a pure Heeler, or a Switch
// Ender who hasn't completed dual-number verification yet).
export function asHeaderNumber(c: Classification): number | null {
  if (c.position === 'Header') return c.globalClassification;
  if (c.position === 'Switch') return c.headerClassification;
  return null;
}

// Same as asHeaderNumber, for heeling.
export function asHeelerNumber(c: Classification): number | null {
  if (c.position === 'Heeler') return c.globalClassification;
  if (c.position === 'Switch') return c.heelerClassification;
  return null;
}

// Can these two people form a valid team under the given cap? Tries every
// role assignment that's actually possible for each person - a fixed
// Header/Heeler only has one possible assignment, a Switch Ender can go
// either way - and returns true if ANY assignment's numbers both exist
// and sum to at or under the cap. Replaces the old canPair(a: Position, b:
// Position), which could only check whether the two POSITIONS were
// compatible in principle - it had no way to see individual numbers at
// all, so it never actually verified the cap math itself for a Switch
// Ender's side of a pairing.
export function canPair(a: Classification, b: Classification, cap: number): boolean {
  const combos: [number | null, number | null][] = [
    [asHeaderNumber(a), asHeelerNumber(b)],
    [asHeaderNumber(b), asHeelerNumber(a)],
  ];
  return combos.some(
    ([header, heeler]) => header != null && heeler != null && round1(header + heeler) <= cap
  );
}

export function formatPosition(position: Position) {
  return position === 'Switch' ? 'Switch Ender' : position;
}

// A short, Tag-component-ready value for displaying this person's
// classification. Switch Enders show both numbers compactly (e.g.
// "6.5/8") since there's no single number that represents them anymore -
// Header/Heeler-only show their one real number, unchanged from before
// this fix. Returns '?' rather than a blank/null if a Switch Ender
// hasn't completed dual-number verification yet.
export function formatClassificationTag(c: Classification): string | number {
  if (c.position === 'Switch') {
    if (c.headerClassification != null && c.heelerClassification != null) {
      return `${c.headerClassification}/${c.heelerClassification}`;
    }
    return '?';
  }
  return c.globalClassification ?? '?';
}

// Fuller, more explicit version of formatClassificationTag for detail
// views (a profile screen, not a small badge) where there's room to
// spell out which number is which rather than a compact "6.5/8".
export function formatClassificationDetail(c: Classification): string {
  if (c.position === 'Switch') {
    if (c.headerClassification != null && c.heelerClassification != null) {
      return `Header: ${c.headerClassification} · Heeler: ${c.heelerClassification}`;
    }
    return 'Not yet verified for both ends';
  }
  return c.globalClassification != null ? String(c.globalClassification) : 'Not verified';
}

// NEW, added 2026-07-27 - policy decision: an expired Global Handicap
// membership does NOT block someone from using the app (see migration
// 0033 and verify-classification-card's own note on this), but other
// users deciding whether to match should be able to see it, so they can
// weigh it themselves rather than a rule silently deciding for them.
//
// null (never successfully read a date - AI verification skipped, or the
// card just didn't have one) is deliberately NOT treated as "not
// current" - only an ACTUAL known-past date counts. Otherwise everyone
// whose card hasn't been machine-read yet would show as expired, which
// isn't true and isn't fair to them.
export function isMembershipCurrent(expirationDate: string | null): boolean | null {
  if (!expirationDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  return expirationDate >= today;
}

export function maxAllowedFor(cap: number, myNumber: number) {
  return round1(cap - myNumber);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// Enforces the real, distinct valid ranges for each end - never actually
// checked anywhere before this fix, despite MAX_HEADER_NUMBER/
// MAX_HEELER_NUMBER already existing. Returns an error message, or null
// if the number is valid for that end.
export function validateClassificationForEnd(value: number, end: 'header' | 'heeler'): string | null {
  const max = end === 'header' ? MAX_HEADER_NUMBER : MAX_HEELER_NUMBER;
  if (value <= 0 || value > max) {
    return `Enter a valid ${end} number (0-${max}).`;
  }
  return null;
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
