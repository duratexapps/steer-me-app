// Canadian province/territory codes, stored in the "state" slot of a
// "City, PROV" location (2026-10-28, Canada in scope). None collide with a
// US state code. Kept separate from canada-areas.ts so a function that only
// needs the codes doesn't load the ~23,000-row town list.
export const CANADA_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
