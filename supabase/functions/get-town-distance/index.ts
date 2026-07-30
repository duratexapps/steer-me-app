// NEW, added 2026-07-29 - real ask, directly from the user, with a direct
// correction: filtering Browse/Events by "farther than I'm willing to
// drive" needs REAL driven miles, not straight-line distance - a large
// state (Texas was the user's own example) can have an in-state event
// that's genuinely farther to drive to than an out-of-state one.
//
// This function is a thin cache-or-compute layer over Google's Routes
// API (computeRouteMatrix):
//   1. Normalize the two town labels into a canonical (alphabetically
//      sorted) pair - real driving distance is very slightly asymmetric
//      in practice (one-way roads, different highway ramps each
//      direction), but that's immaterial for a travel-distance FILTER
//      (not turn-by-turn navigation), and treating (A,B)/(B,A) as one
//      cached pair halves real API calls for no meaningful accuracy cost.
//   2. Check town_distances for that pair first (migration 0040) - real
//      driving distance between two fixed towns never changes, so once
//      computed it's cached forever.
//   3. On a cache miss, call Google's Routes API, store the result,
//      return it.
//
// FIXED live 2026-07-29, before this ever worked once: originally built
// against the classic "Distance Matrix API" - confirmed live that
// Google now treats that as legacy and rejects it for new projects
// ("You're calling a legacy API, which is not enabled for your
// project... switch to the Places API (New) or Routes API"). Rewritten
// against the Routes API's computeRouteMatrix endpoint instead, which
// has a meaningfully different shape:
//   - POST with a JSON body (origins/destinations as address waypoints),
//     not GET with query params.
//   - Auth via an X-Goog-Api-Key header, not a `key` query param.
//   - REQUIRES an explicit X-Goog-FieldMask header - the legacy API
//     returned everything by default; this one returns nothing at all
//     without an explicit mask.
//   - Response is newline-delimited JSON (one object per origin/
//     destination pair, even for our single 1x1 request), not one
//     single JSON object.
//
// The client is also expected to try a DIRECT read against
// town_distances first (public SELECT policy) before ever invoking this
// function at all - most lookups become a plain cached DB read once
// popular towns have been queried once, with this function only ever
// hit for genuinely new town pairs.
//
// Google's Routes API accepts and geocodes plain "City, ST" address
// strings directly - no separate geocoding dataset needed, and both
// profiles.home_area and events.location already use exactly that
// format (AutocompleteField-constrained town names).
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const METERS_PER_MILE = 1609.344;

type DistanceRequest = {
  townA: string;
  townB: string;
};

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

  try {
    const { townA, townB } = (await req.json()) as DistanceRequest;
    if (!townA || !townB) {
      return new Response(JSON.stringify({ error: 'townA and townB are both required.' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Canonical, order-independent pair - see file header for why.
    const [origin, destination] = [townA, townB].sort();

    const supabase = createSupabaseAdmin();

    const { data: cached, error: cacheError } = await supabase
      .from('town_distances')
      .select('miles')
      .eq('origin_town', origin)
      .eq('destination_town', destination)
      .maybeSingle();
    if (cacheError) throw cacheError;
    if (cached) {
      return new Response(JSON.stringify({ miles: cached.miles, cached: true }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_DISTANCE_MATRIX_API_KEY');
    if (!apiKey) {
      // Fail soft, not hard - a missing key should degrade to "distance
      // unknown, don't filter this out" rather than break Browse/Events
      // entirely for everyone.
      console.warn('[get-town-distance] GOOGLE_DISTANCE_MATRIX_API_KEY not set - skipping.');
      return new Response(JSON.stringify({ miles: null, cached: false, skipped: true }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(ROUTE_MATRIX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Required by this API - no default field set like the legacy
        // Distance Matrix API had. originIndex/destinationIndex let us
        // find our (only) pair in the response array; condition/status
        // flag whether the route computation actually succeeded.
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition,status',
      },
      body: JSON.stringify({
        origins: [{ waypoint: { address: origin } }],
        destinations: [{ waypoint: { address: destination } }],
        travelMode: 'DRIVE',
      }),
    });

    // computeRouteMatrix streams newline-delimited JSON objects (one per
    // origin/destination pair) rather than one single JSON object - with
    // exactly one origin and one destination here, there's exactly one
    // line to parse.
    const rawText = await res.text();
    let results: Array<Record<string, unknown>>;
    try {
      // Google wraps the NDJSON stream in a top-level JSON array when
      // fetched as a single response body (rather than true streaming) -
      // handle both shapes defensively.
      const parsed = JSON.parse(rawText);
      results = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      results = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    const element = results[0];
    const distanceMeters = element?.distanceMeters as number | undefined;
    const condition = element?.condition as string | undefined;
    // FIXED live 2026-07-29: a SUCCESSFUL computeRouteMatrix result still
    // includes a `status: {}` field - an empty (but present) google.rpc.Status
    // object, which is Google's normal way of saying "no error." Confirmed
    // live: a real, working response for Houston -> Lake Charles came back
    // as { distanceMeters: 234701, condition: 'ROUTE_EXISTS', status: {} }
    // and was being wrongly rejected here, because `{}` is truthy in JS -
    // `if (errorStatus)` treated "no error" as "an error." A real error
    // status always carries a `code` (a non-zero google.rpc.Code), so check
    // for that specifically rather than mere presence of the status object.
    const errorStatus = element?.status as { code?: number } | undefined;

    if (!res.ok || errorStatus?.code || condition !== 'ROUTE_EXISTS' || typeof distanceMeters !== 'number') {
      // Confirmed working end-to-end 2026-07-29 (Houston -> Lake Charles,
      // Houston -> El Paso, and the order-independent cache) - the earlier
      // debug field dumping the raw Google response back to the caller has
      // been removed now that it's no longer needed to diagnose failures.
      console.error(`[get-town-distance] Routes API did not return a usable route for "${origin}" -> "${destination}": ${rawText}`);
      return new Response(JSON.stringify({ miles: null, cached: false, error: 'Could not compute distance for this pair.' }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const miles = Math.round((distanceMeters / METERS_PER_MILE) * 10) / 10;

    const { error: insertError } = await supabase
      .from('town_distances')
      .upsert({ origin_town: origin, destination_town: destination, miles }, { onConflict: 'origin_town,destination_town', ignoreDuplicates: true });
    if (insertError) {
      // Don't fail the request over a caching write failure - the
      // caller still gets a correct answer this time, just without the
      // cache benefit for next time.
      console.error(`[get-town-distance] Failed to cache result: ${insertError.message}`);
    }

    return new Response(JSON.stringify({ miles, cached: false }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[get-town-distance] threw: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(JSON.stringify({ miles: null, error: 'Internal error computing distance.' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});
