import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import { showToast } from '@/src/state/toast-store';

// Reads the same `subscriptions` table the RLS policies check via
// has_active_subscription() - this is the real gate (kept fresh by the
// revenuecat-webhook Edge Function), not the client SDK's local cache. The
// SDK is only used here to drive the purchase transaction itself; whether
// the UI treats the user as subscribed always comes from this query.
export function useSubscriptionStatus() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['subscription-status', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('entitlement_active, product_id, expires_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { entitlement_active: false, product_id: null, expires_at: null };
    },
    // The webhook can take a few seconds to land after a purchase - poll
    // briefly rather than make the user manually refresh.
    refetchInterval: (query) => (query.state.data?.entitlement_active ? false : 4000),
  });
}

export function useInvalidateSubscriptionStatus() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return () => queryClient.invalidateQueries({ queryKey: ['subscription-status', userId] });
}

// Proactive gate for paid actions (send a request, mark attending) so the
// user sees a clear "subscribe first" prompt instead of a raw Postgres RLS
// error - the RLS policy itself is still the real enforcement either way.
export function useRequireSubscription() {
  const { data: status } = useSubscriptionStatus();
  return () => {
    if (status?.entitlement_active) return true;
    showToast('An active subscription is needed for this');
    router.push('/subscription');
    return false;
  };
}
