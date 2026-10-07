// The WSTR Finale runs in early/mid December. A Finale flag belongs to that
// year until Dec 15 - the same cutoff public_profiles uses in migration 0066.
export function currentFinaleYear(now: Date = new Date()): number {
  const cutoff = new Date(now.getFullYear(), 11, 15);
  return now < cutoff ? now.getFullYear() : now.getFullYear() + 1;
}

// Flags can be set for the Finale that is next up AND the one after it: the
// next year's qualifiers start before this year's Finale has run (a 2027
// qualifier was held in November 2026), so both are live at once.
export function activeFinaleYears(now: Date = new Date()): number[] {
  const y = currentFinaleYear(now);
  return [y, y + 1];
}

// Classes the Finale actually runs, per the published Finale listing.
export const FINALE_CLASSES = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5];
