// Backs AutocompleteField.tsx (Home Area on sign-up/edit-profile, Location
// on Create Event/Admin Post Event). Perf pass, 2026-08-16: this used to be
// a client-side scan over a ~32,000-row array bundled directly into the
// app (see _shared/home-areas.ts's own comment) - every install shipped
// and parsed that array at cold start regardless of whether the user ever
// touched an autocomplete field. Moving the dataset server-side and
// searching it here trims that from the app bundle entirely; the search
// itself is a trivial in-memory scan (sub-millisecond), so the only added
// cost is one network round trip, already covered by the 200ms debounce
// AutocompleteField already had.
import { HOME_AREAS } from '../_shared/home-areas.ts';
import { CANADA_AREAS } from '../_shared/canada-areas.ts';

// Accents and periods are ignored on both sides, so "montreal" finds
// Montréal, QC and "fort st john" finds Fort St. John, BC.
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').toLowerCase();
}

// US + Canada merged into one alphabetical list (2026-10-28). The scan
// below stops at the first 8 prefix matches, so a plain concat would bury
// Canadian towns behind every same-named US town ("Brooks" -> 8 US hits,
// never Brooks, AB). Within one name, US towns come first (most users are
// US), then Canadian. Sorted and normalized once per cold start.
const PLACES = [
  ...HOME_AREAS.map((e) => ({ ...e, ca: 0 })),
  ...CANADA_AREAS.map((e) => ({ ...e, ca: 1 })),
]
  .map((e) => ({ city: e.city, state: e.state, ca: e.ca, key: normalize(e.city), label: normalize(`${e.city}, ${e.state}`) }))
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.ca - b.ca || (a.state < b.state ? -1 : a.state > b.state ? 1 : 0)));

// Same CORS shape as get-town-distance - this is called from the web build
// (browser origin), not just native, so the preflight OPTIONS request and
// Access-Control-Allow-Origin header are required, not optional.
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  let query = '';
  try {
    const body = await req.json();
    // A real place name is short; capping the length keeps a scripted caller from making the scan do more work per request.
    query = typeof body?.query === 'string' ? body.query.slice(0, 60) : '';
  } catch {
    // no body / invalid JSON - treat as empty query
  }

  const q = normalize(query.trim());
  if (!q) {
    return Response.json({ results: [] }, { headers: corsHeaders() });
  }

  const startsWith: { city: string; state: string }[] = [];
  const contains: { city: string; state: string }[] = [];
  for (const entry of PLACES) {
    // Prefix on the full "city, st" label, so "red deer, ab" ranks Red Deer, AB first.
    if (entry.label.startsWith(q)) {
      startsWith.push(entry);
      if (startsWith.length >= 8) break;
    } else if (contains.length < 8 && entry.label.includes(q)) {
      contains.push(entry);
    }
  }

  const results = [...startsWith, ...contains].slice(0, 8).map((e) => ({ city: e.city, state: e.state }));
  return Response.json({ results }, { headers: corsHeaders() });
});
