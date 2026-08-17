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

// TESTING MODE - has_active_subscription() (the real enforcement point,
// checked by RLS on partner_requests/event_attendance/need_posts/
// goat_roping_interest - see migration 0028_testing_phase_disable_subscription_gate.sql)
// currently always returns true, matching the agreed testing-phase plan:
// free access for everyone until a deliberate paywall cutover later. This
// client-side flag exists only so the UI doesn't show a misleading
// "subscription required" prompt while that's true - it has no effect on
// actual enforcement, which lives entirely in that migration. Flip both
// together when ready to launch subscriptions for real.
const SUBSCRIPTION_REQUIRED = false;

// Proactive gate for paid actions (send a request, mark attending) so the
// user sees a clear "subscribe first" prompt instead of a raw Postgres RLS
// error - the RLS policy itself is still the real enforcement either way.
export function useRequireSubscription() {
  const { data: status } = useSubscriptionStatus();
  return () => {
    if (!SUBSCRIPTION_REQUIRED) return true;
    if (status?.entitlement_active) return true;
    showToast('An active subscription is needed for this');
    router.push('/subscription');
    return false;
  };
}
