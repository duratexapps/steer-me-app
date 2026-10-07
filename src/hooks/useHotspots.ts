import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';

// Where the action is right now (migration 0071). Rows are edited in the
// database (SQL editor / service role) as seasons turn - no app release.
export type Hotspot = {
  id: string;
  name: string;
  state: string;
  towns: string[];
  hot_from: string | null;
  hot_until: string | null;
  sort_order: number;
};

export function useHotspots() {
  return useQuery({
    queryKey: ['hotspots'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Hotspot[]> => {
      const { data, error } = await supabase.from('hotspots').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as Hotspot[];
    },
  });
}

// Inclusive window; a hotspot with no dates is never "hot".
export function isHotspotHot(h: Hotspot, now: Date = new Date()): boolean {
  if (!h.hot_from || !h.hot_until) return false;
  const today = now.toISOString().slice(0, 10);
  return h.hot_from <= today && today <= h.hot_until;
}
