// The web version of Steer Me (steerme.ropingtools.com) calls Edge Functions
// from the browser, which sends a CORS "preflight" (OPTIONS) request first.
// Functions that require a signed-in user (verify_jwt) were rejecting that
// preflight with a 401 because it carries no auth header, which silently broke
// every web call to them (found 2026-10-07 while testing promo-code
// redemption). These functions validate the caller themselves (auth.getUser),
// so the gateway JWT check is switched off for them in config.toml and this
// wrapper answers the preflight and adds CORS headers to every response.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function serveWithCors(handler: (req: Request) => Promise<Response> | Response) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  });
}
