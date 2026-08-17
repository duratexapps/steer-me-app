import { createSupabaseAdmin } from './supabase-admin.ts';

// Abuse-ceiling rate limiting - see migration 0055_rate_limit_hits.sql for
// the full reasoning. Not a cost-control mechanism at realistic usage
// volumes, a scripted-abuse ceiling: thresholds should stay generous
// enough that no real person ever notices them.

// IPs aren't stored raw, same privacy posture as Draw Pro's own
// abuse_prevention_ledger fingerprint hashing - only needed to distinguish
// one caller from another, never to identify who they are.
//
// CONFIRMED live 2026-08-17 via a throwaway debug function: Supabase Edge
// Functions run behind Cloudflare, which REPLACES any client-supplied
// x-forwarded-for with the real proxy chain - a caller can't spoof this by
// sending their own fake header (good - the rate limit can't be trivially
// bypassed that way). Cloudflare's purpose-built header for "the real
// visitor IP" is cf-connecting-ip, which is more reliable than assuming
// x-forwarded-for's first entry is always the client (true in the observed
// chain today, but not guaranteed by any spec) - prefer it, fall back to
// x-forwarded-for for local/non-Cloudflare invocation (e.g. `supabase
// functions serve`).
export async function callerIpScope(req: Request): Promise<string> {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = req.headers.get('cf-connecting-ip') || forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ip:${hex}`;
}

// Counts hits for this scope+action within the trailing window, logs this
// hit if under the limit, and returns whether the caller is still allowed
// through. Fails OPEN on a database error - rate limiting is a defense
// layer, not the primary access control, and a Supabase hiccup here
// shouldn't block a real user's request.
export async function checkRateLimit(
  scope: string,
  action: string,
  maxCount: number,
  windowMinutes: number
): Promise<boolean> {
  const supabase = createSupabaseAdmin();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope)
    .eq('action', action)
    .gte('created_at', windowStart);

  if (error) {
    console.error('[rate-limit] count check failed, failing open', action, error);
    return true;
  }

  if ((count ?? 0) >= maxCount) {
    return false;
  }

  await supabase.from('rate_limit_hits').insert({ scope, action });
  return true;
}
