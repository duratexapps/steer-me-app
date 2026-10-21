import { supabase } from '@/src/lib/supabase';

// Web subscriptions through Stripe (migration 0098, Edge Functions stripe-checkout / stripe-portal). Web only:
// the iOS and Android apps keep using the store purchase flow and never link here.
export type WebPlan = 'monthly' | 'yearly';

// A non-2xx answer from an Edge Function arrives as an error whose `context` is the Response; its JSON body has
// the plain-language message we want to show.
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

export async function startWebCheckout(plan: WebPlan): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { plan } });
  if (error) throw await friendlyError(error, "We couldn't start checkout. Please try again.");
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("We couldn't start checkout. Please try again.");
  return url;
}

export async function openBillingPortal(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} });
  if (error) throw await friendlyError(error, "We couldn't open your subscription settings. Please try again.");
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("We couldn't open your subscription settings. Please try again.");
  return url;
}
