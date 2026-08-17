// NEW, added 2026-08-12 - real request from the user, starting a content
// push to grow Steer Me's user base: a live new-user counter, checkable
// from a bookmarked page on their phone rather than asking in a Claude
// Code session each time (Claude Code and the Claude.ai Chat app are
// separate products with no bridge between them - this Edge Function is
// the actual mechanism that makes "check anytime, anywhere" possible).
//
// PUBLIC, no-auth endpoint (verify_jwt = false, see config.toml) - same
// category as the webhook functions, but for a different reason: this
// one is public specifically so a static page (a Claude Artifact) with
// no logged-in Supabase session can call it directly. Safe to leave
// public because it ONLY EVER returns pre-aggregated counts, computed
// here server-side with the service-role key - never raw rows, never
// names/emails/any PII. There is nothing in the response an attacker
// could use for anything; worst case someone else also learns the
// signup count.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // scrubbed = true means a real account that requested data deletion
    // (see the Privacy Policy's deletion-request handling) - not counted
    // as an active user for a growth counter, same reasoning as excluding
    // a deactivated Draw Pro producer from an active-account count.
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('created_at')
      .eq('scrubbed', false);

    if (error) {
      console.error('[get-user-stats] query failed', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);

    let newToday = 0;
    let newThisWeek = 0;
    let newThisMonth = 0;
    // One entry per day for the last 30 days, oldest first - what the
    // dashboard's sparkline/bar chart renders. Keyed by YYYY-MM-DD.
    const dailyCounts = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      dailyCounts.set(d.toISOString().slice(0, 10), 0);
    }

    for (const p of profiles ?? []) {
      const created = new Date(p.created_at as string);
      if (created >= startOfToday) newToday++;
      if (created >= sevenDaysAgo) newThisWeek++;
      if (created >= thirtyDaysAgo) newThisMonth++;
      const dayKey = created.toISOString().slice(0, 10);
      if (dailyCounts.has(dayKey)) {
        dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
      }
    }

    const dailySignups = Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count }));

    return new Response(
      JSON.stringify({
        totalUsers: (profiles ?? []).length,
        newToday,
        newThisWeek,
        newThisMonth,
        dailySignups,
        generatedAt: now.toISOString(),
      }),
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error('[get-user-stats] threw', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
