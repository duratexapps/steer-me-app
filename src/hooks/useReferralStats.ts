import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type ReferralStats = {
  referred_count: number;
  rewarded_count: number;
};

// NEW, added 2026-07-27, alongside migration 0034's get_referral_stats()
// RPC - see that function's own comment for why this is an RPC rather
// than a direct table query (avoids exposing the full referred_by list).
export function useReferralStats() {
  const userId = useSessionStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: ['referral-stats', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ReferralStats> => {
      const { data, error } = await supabase.rpc('get_referral_stats').single();
      if (error) throw error;
      return data as ReferralStats;
    },
  });
}
