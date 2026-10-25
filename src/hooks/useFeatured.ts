import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import { canBuyFeaturedHere, type FeaturedPricing } from '@/src/lib/featured';

// The featuring switch and prices (get_featured_pricing, migration 0109). `offer` is true only when featuring is turned
// on AND this is the website, which is where it is sold.
export function useFeaturedPricing() {
  const userId = useSessionStore((s) => s.session?.user.id);
  const query = useQuery({
    queryKey: ['featured-pricing', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FeaturedPricing> => {
      const { data, error } = await supabase.rpc('get_featured_pricing');
      if (error) throw error;
      return data as FeaturedPricing;
    },
  });
  return { pricing: query.data, offer: !!query.data?.enabled && canBuyFeaturedHere };
}
