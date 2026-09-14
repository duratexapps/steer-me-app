// NEW, added 2026-09-13 - the anonymous read side of the "show at the
// gate" Coggins-sharing flow (see migration 0063). PUBLIC, no-auth
// (verify_jwt = false, see config.toml) by necessity: event staff scanning
// a roper's QR code has no Steer Me account and no session at all. Safe to
// leave public because the token itself is opaque (meaningless without
// this lookup) and every token server-forces a 30-minute expiry at
// creation (coggins_shares_force_expiry trigger) - this function can only
// ever reveal what a real, still-valid share token points to, nothing more.
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

  const token = new URL(req.url).searchParams.get('token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    const { data: share, error: shareError } = await supabaseAdmin
      .from('coggins_shares')
      .select('owner_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (shareError) {
      console.error('[get-coggins-share] share lookup failed', shareError);
      return new Response(JSON.stringify({ error: shareError.message }), { status: 500, headers: CORS_HEADERS });
    }
    if (!share || new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'expired' }), { status: 404, headers: CORS_HEADERS });
    }

    const { data: horses, error: horsesError } = await supabaseAdmin
      .from('horse_documents')
      .select('id, horse_name, description, test_date, document_path')
      .eq('owner_id', share.owner_id)
      .order('horse_name', { ascending: true });

    if (horsesError) {
      console.error('[get-coggins-share] horse_documents lookup failed', horsesError);
      return new Response(JSON.stringify({ error: horsesError.message }), { status: 500, headers: CORS_HEADERS });
    }

    // Signed for 5 minutes regardless of how much of the share's own
    // 30-minute window is left - a page left open past that just needs a
    // reload, same "fetch fresh, don't cache" convention signedUrlFor()
    // already uses client-side for verification screenshots.
    const withUrls = await Promise.all(
      (horses ?? []).map(async (h) => {
        const { data: signed } = await supabaseAdmin.storage
          .from('coggins-documents')
          .createSignedUrl(h.document_path, 300);
        return {
          id: h.id,
          horse_name: h.horse_name,
          description: h.description,
          test_date: h.test_date,
          image_url: signed?.signedUrl ?? null,
        };
      })
    );

    return new Response(
      JSON.stringify({ horses: withUrls, expires_at: share.expires_at }),
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error('[get-coggins-share] threw', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
