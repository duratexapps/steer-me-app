// Sends the "you have a partner request" and "your request was accepted" notices (migration 0122 trigger -> pg_net ->
// here). A push if the person has a token and has not opted out, plus an email unless they turned request emails off.
// Every attempt writes one notification_log row so the nightly check can see failures. Test, demo and staff accounts are
// never emailed. Auth: the shared x-webhook-secret, same as the other database webhooks.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const FROM = 'Steer Me <notifications@ropingtoolsmail.com>';
const REPLY_TO = 'ropingtools@duratex-ie.com';
const APP_URL = 'https://steerme.ropingtools.com/my-requests';
const INTERNAL = /(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$/i;

type Row = Record<string, any>;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function describe(p: Row): string {
  if (p.position === 'Switch') return `Switch ender ${p.header_classification ?? '?'} header / ${p.heeler_classification ?? '?'} heeler`;
  const n = p.global_classification;
  return `${p.position ?? 'Roper'}${n != null ? ` ${n}` : ''}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  let body: { kind?: string; requestId?: string; testTo?: string };
  try { body = await req.json(); } catch { return new Response('Invalid JSON body', { status: 400 }); }
  if (!body.requestId || (body.kind !== 'received' && body.kind !== 'accepted')) return Response.json({ skipped: true, reason: 'bad payload' });

  const admin = createSupabaseAdmin();
  const log = async (row: Row) => { try { await admin.from('notification_log').insert({ kind: body.kind, request_id: body.requestId, ...row }); } catch (e) { console.error('notification_log insert failed', e); } };

  try {
    const { data: r } = await admin.from('partner_requests').select('id,requester_id,recipient_id,status,event_id,need_post_id').eq('id', body.requestId).maybeSingle();
    if (!r) return Response.json({ skipped: true, reason: 'request not found' });
    if (body.kind === 'received' && r.status !== 'pending') return Response.json({ skipped: true, reason: `status ${r.status}` });
    if (body.kind === 'accepted' && r.status !== 'accepted') return Response.json({ skipped: true, reason: `status ${r.status}` });

    const targetId = body.kind === 'received' ? r.recipient_id : r.requester_id;
    const otherId = body.kind === 'received' ? r.requester_id : r.recipient_id;
    const cols = 'id,full_name,position,global_classification,header_classification,heeler_classification,is_demo,suspended,expo_push_token,push_opted_out,email_request_notices';
    const { data: people } = await admin.from('profiles').select(cols).in('id', [targetId, otherId]);
    const target = (people ?? []).find((p: Row) => p.id === targetId);
    const other = (people ?? []).find((p: Row) => p.id === otherId);
    if (!target || !other) { await log({ user_id: targetId, push_status: 'skipped', email_status: 'skipped', detail: 'profile missing' }); return Response.json({ skipped: true, reason: 'profile missing' }); }
    const testTo = typeof body.testTo === 'string' && body.testTo.includes('@') ? body.testTo : null; // sends ONLY an email to this address, for checking the wording
    if (!testTo && (target.is_demo || target.suspended)) { await log({ user_id: targetId, push_status: 'skipped', email_status: 'skipped', detail: target.is_demo ? 'demo account' : 'suspended' }); return Response.json({ skipped: true, reason: 'demo or suspended' }); }

    let eventName = '';
    if (r.event_id) { const { data: ev } = await admin.from('events').select('name').eq('id', r.event_id).maybeSingle(); eventName = ev?.name ?? ''; }

    const who = other.full_name || 'A roper';
    const title = body.kind === 'received' ? 'New partner request' : 'Your request was accepted';
    const pushBody = body.kind === 'received'
      ? `${who} (${describe(other)}) wants to rope with you${eventName ? ` at ${eventName}` : ''}. Open Steer Me to accept or decline.`
      : `${who} accepted your partner request${eventName ? ` for ${eventName}` : ''}. Open Steer Me to see how to reach them.`;

    // push
    let pushStatus = 'no_token';
    let detail = '';
    if (testTo) pushStatus = 'skipped';
    else if (target.push_opted_out) pushStatus = 'opted_out';
    else if (target.expo_push_token) {
      try {
        const res = await fetch(EXPO_PUSH_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ to: target.expo_push_token, title, body: pushBody, sound: 'default', channelId: 'default', data: { type: 'partner_request', requestId: r.id } }),
        });
        const j = await res.json().catch(() => ({}));
        const ticket = Array.isArray(j?.data) ? j.data[0] : j?.data;
        if (res.ok && ticket?.status === 'ok') pushStatus = 'sent';
        else { pushStatus = 'failed'; detail += `push: ${res.status} ${JSON.stringify(ticket ?? j).slice(0, 160)}; `; }
      } catch (e) { pushStatus = 'failed'; detail += `push threw: ${e instanceof Error ? e.message : 'error'}; `; }
    }

    // email
    let emailStatus = 'skipped';
    const { data: u } = await admin.auth.admin.getUserById(targetId);
    const email = testTo ?? u?.user?.email ?? '';
    if (!email || (!testTo && INTERNAL.test(email))) emailStatus = 'skipped';
    else if (!testTo && target.email_request_notices === false) emailStatus = 'off';
    else {
      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (!apiKey) { emailStatus = 'failed'; detail += 'RESEND_API_KEY not set; '; }
      else {
        const first = (target.full_name || '').trim().split(/\s+/)[0] || 'there';
        const subject = body.kind === 'received' ? `${who} sent you a partner request on Steer Me` : `${who} accepted your partner request on Steer Me`;
        const lead = body.kind === 'received'
          ? `<strong>${esc(who)}</strong> (${esc(describe(other))}) wants to rope with you${eventName ? ` at <strong>${esc(eventName)}</strong>` : ''}.`
          : `<strong>${esc(who)}</strong> accepted your partner request${eventName ? ` for <strong>${esc(eventName)}</strong>` : ''}.`;
        const action = body.kind === 'received' ? 'Open Steer Me to accept or decline.' : 'Open Steer Me to see how to reach them.';
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#1E140F;line-height:1.55;font-size:15px">
<p>Hi ${esc(first)},</p><p>${lead}</p><p>${action}</p>
<p><a href="${APP_URL}" style="display:inline-block;background:#A5823F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Open My Requests</a></p>
<p style="color:#6b5a48;font-size:13px">You get this because you have a Steer Me account. Want fewer emails? Just reply and tell us.</p>
<p>Thank you,<br>Justin<br>Steer Me</p></div>`;
        const text = `Hi ${first},\n\n${lead.replace(/<[^>]+>/g, '')}\n\n${action}\n${APP_URL}\n\nYou get this because you have a Steer Me account. Want fewer emails? Just reply and tell us.\n\nThank you,\nJustin\nSteer Me`;
        try {
          const res = await fetch(RESEND_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [email], reply_to: REPLY_TO, subject, html, text }) });
          if (res.ok) emailStatus = 'sent'; else { emailStatus = 'failed'; detail += `email: ${res.status} ${(await res.text()).slice(0, 160)}; `; }
        } catch (e) { emailStatus = 'failed'; detail += `email threw: ${e instanceof Error ? e.message : 'error'}; `; }
      }
    }

    await log({ user_id: targetId, push_status: pushStatus, email_status: emailStatus, detail: (testTo ? `TEST to ${testTo}; ` : '') + detail || null });
    return Response.json({ kind: body.kind, push: pushStatus, email: emailStatus });
  } catch (e) {
    console.error('notify-partner-request failed', e);
    await log({ push_status: 'failed', email_status: 'failed', detail: e instanceof Error ? e.message.slice(0, 200) : 'error' });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
});
