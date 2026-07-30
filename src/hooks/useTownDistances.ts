import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase';

// Real ask, directly from the user, with a direct correction: filtering
// Events by "farther than I'm willing to drive" needs REAL driven miles,
// not straight-line distance ("Some states are huge. Texas for instance.
// In some cases an event in Louisiana is closer than an event in west
// texas.") - see migration 0040_town_distances.sql and the
// get-town-distance Edge Function for the full reasoning/mechanism.
//
// This hook is the CLIENT side of that cache-or-compute design: try a
// direct, free, public read against town_distances first (covers every
// already-popular town pair with zero latency/cost), and only invoke the
// Edge Function (which calls Google's Routes API and writes the result
// back to the cache for next time) for genuinely new pairs.
export type TownDistanceMap = Map<string, number | null>; // event location -> miles from home (null = couldn't compute, don't block on it)

export function useTownDistances(homeArea: string | null | undefined, locations: string[]) {
  const uniqueLocations = [...new Set(locations)].filter((l) => l && l !== homeArea);
  // Stable dependency key - the array/set above is a new reference every
  // render even when its actual contents haven't changed, which would
  // otherwise re-trigger this effect (and re-hit the network) on every
  // single render of the Events screen.
  const depKey = homeArea ? `${homeArea}::${uniqueLocations.slice().sort().join('|')}` : '';

  const [distances, setDistances] = useState<TownDistanceMap>(new Map());

  useEffect(() => {
    if (!homeArea || uniqueLocations.length === 0) {
      setDistances(new Map());
      return;
    }
    let cancelled = false;

    (async () => {
      const next = new Map<string, number | null>();

      // Two separate .eq() queries, not a single .or() - homeArea is a
      // "City, ST" string that itself CONTAINS a comma, and PostgREST's
      // .or() filter syntax uses commas to separate conditions. Embedding
      // a comma-containing value directly into an .or() string would
      // silently mis-parse the filter. Two plain .eq() queries sidestep
      // that entirely and are just as cheap (both indexed lookups).
      const [asOrigin, asDestination] = await Promise.all([
        supabase.from('town_distances').select('destination_town, miles').eq('origin_town', homeArea),
        supabase.from('town_distances').select('origin_town, miles').eq('destination_town', homeArea),
      ]);
      for (const row of (asOrigin.data ?? []) as { destination_town: string; miles: number }[]) {
        next.set(row.destination_town, row.miles);
      }
      for (const row of (asDestination.data ?? []) as { origin_town: string; miles: number }[]) {
        next.set(row.origin_town, row.miles);
      }

      if (cancelled) return;
      setDistances(new Map(next));

      // Anything still missing is a genuine cache miss - compute one at a
      // time via the Edge Function. Sequential (not Promise.all) on
      // purpose: a burst of brand-new events all posted at once shouldn't
      // fire a stampede of simultaneous Google API calls from one user's
      // single page load.
      const missing = uniqueLocations.filter((loc) => !next.has(loc));
      for (const loc of missing) {
        if (cancelled) return;
        try {
          const { data, error } = await supabase.functions.invoke('get-town-distance', {
            body: { townA: homeArea, townB: loc },
          });
          next.set(loc, !error && data && typeof data.miles === 'number' ? data.miles : null);
        } catch {
          next.set(loc, null); // fail soft - an unknown distance just means "don't filter this one out"
        }
        if (cancelled) return;
        setDistances(new Map(next));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return distances;
}
