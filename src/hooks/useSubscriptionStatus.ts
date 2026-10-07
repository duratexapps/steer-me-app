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
//
// PERF, 2026-08-16: `enablePolling` defaults to false now - this hook is
// also called (via useRequireSubscription below) from events.tsx,
// browse.tsx, and post.tsx, none of which ever read the fetched status
// while SUBSCRIPTION_REQUIRED is false (useRequireSubscription short-
// circuits before touching it). The old unconditional 4s interval meant
// every signed-in user sitting on any of those three tabs fired a
// Supabase query every 4 seconds indefinitely, for data nobody was using.
// Only app/subscription.tsx - the actual purchase screen, where a fresh
// entitlement really is worth polling briefly for right after a purchase -
// opts in.
export function useSubscriptionStatus(enablePolling = false) {
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
    refetchInterval: enablePolling ? (query) => (query.state.data?.entitlement_active ? false : 4000) : false,
  });
}

export function useInvalidateSubscriptionStatus() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return () => queryClient.invalidateQueries({ queryKey: ['subscription-status', userId] });
}

// Free-tier rule (migration 0069): a user may act while they hold an active
// subscription OR have fewer than N accepted matches (N = 3), but only once
// the server-side `paywall_enabled` switch is on - until then everyone is
// allowed, exactly as during testing. The database (has_active_subscription,
// checked by RLS) is the real enforcement; this hook only reads the same
// answer so the UI can prompt instead of surfacing a raw Postgres error, and
// so the subscription screen can show "2 of 3 free matches used".
export type FreeTierStatus = {
  paywall_enabled: boolean;
  free_matches: number;
  matches_used: number;
  subscribed: boolean;
  allowed: boolean;
};

export function useFreeTierStatus() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['free-tier-status', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<FreeTierStatus> => {
      const { data, error } = await supabase.rpc('get_free_tier_status');
      if (error) throw error;
      return data as FreeTierStatus;
    },
  });
}

// Proactive gate for paid actions (send a request, mark attending) so the
// user sees a clear "subscribe first" prompt instead of a raw Postgres RLS
// error - the RLS policy itself is still the real enforcement either way.
// If the status hasn't loaded (or the call failed) this lets the action
// through and leaves the decision to RLS.
export function useRequireSubscription() {
  const { data: status } = useFreeTierStatus();
  return () => {
    if (!status || status.allowed) return true;
    showToast(`You've used your ${status.free_matches} free matches - subscribe to keep going`);
    router.push('/subscription');
    return false;
  };
}
