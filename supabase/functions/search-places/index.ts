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
    query = typeof body?.query === 'string' ? body.query : '';
  } catch {
    // no body / invalid JSON - treat as empty query
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    return Response.json({ results: [] }, { headers: corsHeaders() });
  }

  const startsWith: { city: string; state: string }[] = [];
  const contains: { city: string; state: string }[] = [];
  for (const entry of HOME_AREAS) {
    const city = entry.city.toLowerCase();
    if (city.startsWith(q)) {
      startsWith.push(entry);
      if (startsWith.length >= 8) break;
    } else if (contains.length < 8 && `${city}, ${entry.state.toLowerCase()}`.includes(q)) {
      contains.push(entry);
    }
  }

  const results = [...startsWith, ...contains].slice(0, 8).map((e) => ({ city: e.city, state: e.state }));
  return Response.json({ results }, { headers: corsHeaders() });
});
