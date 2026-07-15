import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { neededOppositePosition, maxAllowedFor } from '@/src/lib/matching';

export type PublicProfile = {
  id: string;
  full_name: string;
  position: 'Header' | 'Heeler';
  home_area: string;
  global_classification: number;
  avatar_url: string | null;
  is_minor: boolean;
};

export function useEligiblePartners(cap: number, nearCity: string | null) {
  const { data: me } = useMyProfile();

  return useQuery({
    queryKey: ['eligible-partners', me?.id, cap, nearCity],
    enabled: !!me,
    queryFn: async () => {
      if (!me?.global_classification) return [];
      const maxAllowed = maxAllowedFor(cap, me.global_classification);

      const { data, error } = await supabase
        .from('public_profiles')
        .select('*')
        .eq('position', neededOppositePosition(me.position))
        .lte('global_classification', maxAllowed)
        .neq('id', me.id)
        .order('global_classification', { ascending: false });

      if (error) throw error;
      const partners = (data ?? []) as PublicProfile[];

      // Mirrors the prototype: surface exact-city matches first when
      // browsing by current location, rather than a real distance sort
      // (home_area is free text, not coordinates).
      if (nearCity) {
        return [...partners].sort(
          (a, b) => Number(b.home_area === nearCity) - Number(a.home_area === nearCity)
        );
      }
      return partners;
    },
  });
}
