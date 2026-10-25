import { Platform } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { isFeatured } from '@/src/lib/date';

export { isFeatured };

// Featured listings (migration 0109, Edge Function stripe-featured-checkout). A clinic, layover spot or hotel owner can
// pay to have their listing featured for a number of days. Switched off in app_settings until featured_listings_enabled
// is true. Offered on the WEBSITE only: the iOS and Android apps do not sell it (store payment rules), so an owner who
// opens the app sees their listing and its featured status but buys on the website.

export type FeaturedPricing = { enabled: boolean; clinic_cents: number; stop_cents: number; days: number };
export type FeaturedTarget = 'event' | 'layover_spot';

export function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export const canBuyFeaturedHere = Platform.OS === 'web';

async function friendlyError(err: unknown, fallback: string): Promise<Error> {
  const ctx = (err as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return new Error(body.error);
    } catch {
      // fall through
    }
  }
  return new Error(fallback);
}

// Returns the Stripe Checkout URL for featuring one listing.
export async function startFeaturedCheckout(targetType: FeaturedTarget, targetId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-featured-checkout', {
    body: { target_type: targetType, target_id: targetId },
  });
  if (error) throw await friendlyError(error, "We couldn't start checkout. Please try again.");
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("We couldn't start checkout. Please try again.");
  return url;
}

export function goToCheckout(url: string) {
  if (Platform.OS === 'web') {
    (globalThis as { location?: { assign: (u: string) => void } }).location?.assign(url);
  }
}
