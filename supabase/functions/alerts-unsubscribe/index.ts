// One-tap unsubscribe from the weekly roping list and instant alerts (link in every email; also the List-Unsubscribe header). No sign-in:
// the unguessable per-member token in alert_prefs is the credential. GET shows a confirmation page and unsubscribes (mail
// clients that pre-fetch links are why the page only ever turns the list OFF, never on); POST handles the one-click
// header. Turning it back on is in the app under Profile, Roping alerts.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, message: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F3EDE0;color:#1E140F;margin:0;padding:48px 20px">
<div style="max-width:460px;margin:0 auto"><h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="line-height:1.55">${message}</p>
<p><a href="https://steerme.ropingtools.com" style="color:#6b5a48">Open Steer Me</a></p></div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!UUID.test(token)) return page('That link did not work', 'The unsubscribe link looks incomplete. You can turn the weekly list off in Steer Me under Profile, Roping alerts, or reply to any of our emails.', 400);

  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from('alert_prefs').update({ weekly: false, instant: false }).eq('unsubscribe_token', token).select('user_id');
  if (error) return page('Something went wrong', 'We could not update your settings. Please try again, or turn the list off in Steer Me under Profile, Roping alerts.', 500);
  if (req.method === 'POST') return new Response(null, { status: 200 });
  if (!data || data.length === 0) return page('That link did not work', 'We could not find that subscription. You can turn the weekly list off in Steer Me under Profile, Roping alerts.', 404);
  return page("You're unsubscribed", "You won't get the weekly roping list or instant roping alerts by email anymore. If you change your mind, turn them back on in Steer Me under Profile, Roping alerts.");
});
