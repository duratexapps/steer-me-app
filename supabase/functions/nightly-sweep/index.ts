// Nightly bottleneck sweep for Steer Me, run by Supabase itself (pg_cron -> run_nightly_sweep() -> this function)
// so it never depends on anyone's computer or an AI agent being awake. Emails the result to ropingtools@duratex-ie.com
// EVERY night, including "all clear": no email by ~7 PM Central means this job (or email delivery) is broken.
//
// Port of tools/triage/triage.py `sweep`, Steer Me checks only (Draw Pro is a separate database, see
// DOCS/triage-system-handoff-for-drawpro.md). Read-only: this function never changes user data and never
// contacts users - it only emails Justin. Auth: shared x-webhook-secret (same db_webhook_secret as the other webhooks).
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const TO = 'ropingtools@duratex-ie.com';
const FROM = 'Steer Me Alerts <trust@ropingtoolsmail.com>';
const ADMIN_EMAIL = 'admin@duratex-ie.com';
const INTERNAL = ['@steerme.test', '@steerme-demo.com', '@duratex-ie.com', '@example.com'];
const REVIEW_NAMES = new Set(['google play reviewer', 'apple app review', 'ios tester']);
const HOUR = 3600 * 1000;

type Row = Record<string, any>;
const hoursSince = (ts: string) => (Date.now() - new Date(ts).getTime()) / HOUR;
const ago = (ts: string | null | undefined) => {
  if (!ts) return 'never';
  const h = hoursSince(ts);
  return h >= 48 ? `${Math.floor(h / 24)}d ago` : h >= 1 ? `${Math.floor(h)}h ago` : `${Math.max(1, Math.floor(h * 60))}m ago`;
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async (req) => {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  let dryRun = false;
  let checkEmailId: string | null = null;
  let toOverride: string | null = null;
  try { const b = await req.json(); dryRun = b?.dryRun === true; checkEmailId = b?.checkEmailId ?? null; toOverride = b?.to ?? null; } catch { /* no body */ }

  // Diagnostic: ask Resend what happened to a message we sent (delivered / bounced / ...).
  if (checkEmailId) {
    const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(checkEmailId)}`, { headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}` } });
    const j = await r.json().catch(() => ({}));
    return Response.json({ status: r.status, last_event: j.last_event, to: j.to, subject: j.subject, created_at: j.created_at });
  }

  const admin = createSupabaseAdmin();
  const urgent: string[] = [];
  const lines: string[] = [];   // one line per check
  const details: string[] = []; // bullet details under checks
  const failed: string[] = [];
  const check = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { failed.push(name); lines.push(`${name}: COULD NOT CHECK (${e instanceof Error ? e.message : 'error'})`); }
  };
  const q = async (p: PromiseLike<{ data: any; error: any }>) => { const { data, error } = await p; if (error) throw new Error(error.message); return (data ?? []) as Row[]; };

  // 1 manual-review queue
  await check('1. Manual-review queue', async () => {
    const p = await q(admin.from('profiles').select('full_name,created_at').eq('needs_manual_review', true).order('created_at'));
    const recent = p.filter((x) => hoursSince(x.created_at) < 7 * 24);
    lines.push(`1. Manual-review queue: ${p.length ? 'ATTENTION - ' + p.length + ' waiting, oldest ' + ago(p[0].created_at) + ': ' + p.slice(0, 8).map((x) => x.full_name).join(', ') + (recent.length ? ' - NEW in the last 7 days: card verification was skipped for a real sign-up' : '') : 'clear'}`);
    if (p.length) urgent.push(`${p.length} profile(s) waiting on manual review (oldest ${ago(p[0].created_at)})`);
  });

  // 2 stale fix notes
  await check('2. Fix notes', async () => {
    const p = await q(admin.from('profiles').select('full_name,fix_note_at').not('fix_note', 'is', null));
    const stale = p.filter((x) => x.fix_note_at && hoursSince(x.fix_note_at) >= 7 * 24);
    lines.push(`2. Fix notes unanswered 7+ days: ${stale.length ? 'ATTENTION - ' + stale.map((x) => x.full_name).join(', ') : `clear (${p.length} open)`}`);
    if (stale.length) urgent.push(`${stale.length} fix note(s) unanswered for 7+ days`);
  });

  // 3 unfinished sign-ups, sorted by what the person is actually doing
  await check('3. Unfinished sign-ups', async () => {
    const users: Row[] = [];
    for (let page = 1; page < 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    const have = new Set([...(await q(admin.from('profiles').select('id'))), ...(await q(admin.from('producer_profiles').select('id')))].map((x) => x.id));
    const nudgeRows = await q(admin.from('nudged_signups').select('email,nudged_on,nudge_count'));
    const nudged = new Map(nudgeRows.map((x) => [String(x.email).toLowerCase(), x.nudged_on as string]));
    // Justin's rule (2026-10-20): the 3rd email is the final one; after that the person is no longer flagged.
    const nudgeCount = new Map(nudgeRows.map((x) => [String(x.email).toLowerCase(), Number(x.nudge_count ?? 1)]));
    const people = users.filter((u) => !have.has(u.id) && u.email && !INTERNAL.some((d) => u.email.toLowerCase().endsWith(d)) && u.email.toLowerCase() !== ADMIN_EMAIL);
    const young = people.filter((u) => hoursSince(u.created_at) <= 24);
    const stuck = people.filter((u) => hoursSince(u.created_at) > 24);
    const nd = (u: Row) => nudged.get(u.email.toLowerCase());
    const finalSent = (u: Row) => (nudgeCount.get(u.email.toLowerCase()) ?? 0) >= 3;
    const lastActH = (u: Row) => {
      const hs = [u.confirmation_sent_at, u.email_confirmed_at, u.last_sign_in_at].filter(Boolean).map((t: string) => hoursSince(t));
      return hs.length ? Math.min(...hs) : null;
    };
    const fresh = stuck.filter((u) => !nd(u));
    const active = fresh.filter((u) => lastActH(u) !== null && lastActH(u)! <= 24);
    const need = fresh.filter((u) => !active.includes(u));
    const done = stuck.filter((u) => nd(u) && finalSent(u));
    const lapsed = stuck.filter((u) => nd(u) && !finalSent(u) && (Date.now() - new Date(nd(u)!).getTime()) / HOUR / 24 >= 7);
    const waiting = stuck.filter((u) => nd(u) && !finalSent(u) && !lapsed.includes(u));
    const desc = (u: Row) => `${u.email} - ${u.email_confirmed_at ? 'confirmed email' : 'NEVER CONFIRMED EMAIL'}; created ${ago(u.created_at)}; last confirmation email ${ago(u.confirmation_sent_at)}; last sign-in ${ago(u.last_sign_in_at)}` + (nd(u) ? `; you emailed ${nd(u)} (email #${nudgeCount.get(u.email.toLowerCase()) ?? 1})` : '');
    lines.push(`3. Unfinished sign-ups: ${need.length || lapsed.length ? 'ATTENTION' : 'clear'} - ${need.length} need an email now; ${active.length} active in the last 24h (give it time); ${lapsed.length} still stuck 7+ days after your email; ${waiting.length} emailed recently, waiting; ${young.length} under 24h old (in progress)${done.length ? `; ${done.length} had the final (3rd) email and are no longer flagged` : ''}`);
    for (const [tag, g] of [['NEEDS AN EMAIL', need], ['ACTIVE - give it time', active], ['STILL STUCK 7+ days after your email', lapsed], ['IN PROGRESS (<24h old)', young]] as [string, Row[]][])
      for (const u of g) details.push(`[${tag}] ${desc(u)}`);
    if (need.length) urgent.push(`${need.length} stuck sign-up(s) with no recent activity - email them (listed below)`);
    if (lapsed.length) urgent.push(`${lapsed.length} stuck account(s) still unfinished 7+ days after your email`);
  });

  // 4 open safety reports + currently suspended profiles
  await check('4. Safety reports', async () => {
    const ur = await q(admin.from('user_reports').select('offense,created_at,reporter_id').eq('status', 'open').order('created_at'));
    const er = await q(admin.from('event_reports').select('offense,created_at,event_id,reporter_id').eq('status', 'open').order('created_at'));
    const ids = [...new Set([...ur, ...er].map((x) => x.reporter_id))];
    const names = new Map<string, string>();
    if (ids.length) for (const p of await q(admin.from('profiles').select('id,full_name').in('id', ids))) names.set(p.id, String(p.full_name).toLowerCase());
    const bot = (x: Row) => REVIEW_NAMES.has(names.get(x.reporter_id) ?? '');
    const realU = ur.filter((x) => !bot(x)), realE = er.filter((x) => !bot(x));
    const botN = ur.length + er.length - realU.length - realE.length;
    const minor = realU.filter((x) => String(x.offense).toLowerCase().includes('minor'));
    lines.push(`4. Open safety reports: ${ur.length + er.length ? 'ATTENTION - ' + [...realU.map((x) => `user report '${x.offense}' open ${ago(x.created_at)}`), ...realE.map((x) => `event report '${x.offense}' open ${ago(x.created_at)}`), ...(botN ? [`${botN} from a store-review account (likely automated - dismiss; check whether it auto-suspended someone)`] : [])].join('; ') : 'none open'}`);
    if (minor.length) urgent.unshift(`URGENT: open report with offense 'Soliciting a minor' needs a human decision today (open ${minor.map((x) => ago(x.created_at)).join(', ')})`);
    if (realU.length || realE.length) urgent.push(`${realU.length} open user report(s), ${realE.length} open event report(s)`);
    if (botN) urgent.push(`${botN} open report(s) filed by a store-review account - likely automated; dismiss and unsuspend anyone auto-suspended`);
    const sp = await q(admin.from('profiles').select('full_name,suspended_reason').eq('suspended', true));
    if (sp.length) urgent.push(`${sp.length} profile(s) currently suspended: ${sp.map((x) => `${x.full_name} (${String(x.suspended_reason ?? '').slice(0, 40)})`).join(', ')}`);
  });

  // 5 pending requests (count only)
  await check('5. Pending requests', async () => {
    const pr = await q(admin.from('partner_requests').select('created_at').eq('status', 'pending'));
    lines.push(`5. Partner requests pending >72h: ${pr.filter((x) => hoursSince(x.created_at) > 72).length} of ${pr.length} pending (count only)`);
  });

  // 6 membership ID conflicts
  await check('6. Membership conflicts', async () => {
    const mc = await q(admin.from('membership_id_conflicts').select('status,notification_error'));
    const bad = mc.filter((x) => x.status === 'pending_review' || x.notification_error);
    lines.push(`6. Membership ID conflicts needing review or with a failed notice: ${bad.length ? 'ATTENTION - ' + bad.length : 'none'}`);
    if (bad.length) urgent.push(`${bad.length} membership ID conflict(s) pending or with a failed notification`);
  });

  // 7 in-app issue reports waiting
  await check('7. Issue reports', async () => {
    const ir = await q(admin.from('issue_reports').select('id,created_at,description').in('status', ['open', 'new']).order('created_at'));
    lines.push(`7. In-app issue reports waiting: ${ir.length}${ir.length ? ' (the triage agent drafts replies; details in the app\'s admin view)' : ''}`);
    if (ir.length) urgent.push(`${ir.length} in-app issue report(s) waiting for a reply`);
  });

  // 8 expired events (count only; the nightly triage agent soft-deletes them)
  await check('8. Expired events', async () => {
    const cut = new Date(Date.now() - 30 * 24 * HOUR).toISOString().slice(0, 10);
    const ev = await q(admin.from('events').select('event_date,event_end_date').eq('status', 'published'));
    const old = ev.filter((e) => (e.event_end_date ?? e.event_date) < cut);
    lines.push(`8. Published events more than 30 days past: ${old.length || 'none'}`);
  });

  // 10 unexpected admins
  await check('10. Admin accounts', async () => {
    const ad = await q(admin.from('profiles').select('full_name').eq('is_admin', true));
    const extra = ad.filter((x) => x.full_name !== 'RopingTools Admin');
    lines.push(`10. Unexpected admin accounts: ${extra.length ? 'URGENT - ' + extra.map((x) => x.full_name).join(', ') : 'none'}`);
    if (extra.length) urgent.unshift(`URGENT: unexpected admin account(s): ${extra.map((x) => x.full_name).join(', ')}`);
  });

  // Feature usage (information only, never an action item): is the hauling-paperwork checker being used?
  await check('11. Feature use', async () => {
    const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
    const ev = await q(admin.from('feature_events').select('event,props,visitor_id,created_at').eq('feature', 'travel_checker').gte('created_at', since).limit(5000));
    const count = (e: string) => ev.filter((x) => x.event === e).length;
    const visitors = new Map<string, Set<string>>();
    for (const x of ev) if (x.visitor_id) (visitors.get(x.visitor_id) ?? visitors.set(x.visitor_id, new Set()).get(x.visitor_id)!).add(String(x.created_at).slice(0, 10));
    const repeat = [...visitors.values()].filter((d) => d.size >= 2).length;
    const routes = new Map<string, number>();
    for (const x of ev.filter((e) => e.event === 'check')) { const k = `${x.props?.from}>${x.props?.to}`; routes.set(k, (routes.get(k) ?? 0) + 1); }
    const top = [...routes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k.replace('>', ' to ')} (${n})`).join(', ');
    lines.push(`11. Hauling paperwork checker, last 7 days: ${count('view')} page views, ${count('check')} route checks from ${visitors.size} visitors (${repeat} came back on another day); helpful yes ${count('helpful_yes')} / not really ${count('helpful_no')}; error reports ${count('report_error')}; opened from the app ${count('open_from_app')}; official tool clicks ${count('open_official')}${top ? '; top routes: ' + top : ''}`);
  });

  // 12 web subscriptions (Stripe). The first real web subscriber is the reminder to look at Stripe Tax: collection is
  // in monitor-only mode, so Stripe will say whether a registration is needed. Owner (comped) accounts don't count.
  // Tell Claude once it's been looked at and app_settings.stripe_tax_reviewed is set true, which stops the reminder.
  await check('12. Web subscriptions', async () => {
    const subs = await q(admin.from('stripe_subscriptions').select('user_id,active,status').not('stripe_subscription_id', 'is', null));
    const comped = new Set((await q(admin.from('comped_users').select('user_id'))).map((x) => x.user_id));
    const real = subs.filter((s) => !comped.has(s.user_id));
    const reviewed = (await q(admin.from('app_settings').select('value').eq('key', 'stripe_tax_reviewed')))[0]?.value === true;
    const live = real.filter((s) => s.active).length;
    lines.push(`12. Web subscriptions (Stripe): ${real.length} real (${live} active)${reviewed ? '; tax already reviewed' : ''}`);
    if (real.length && !reviewed) urgent.push('First web (Stripe) subscriber(s) now exist: open Stripe > Tax and check whether it flags a registration or any location needing attention, then tell Claude it is reviewed so this reminder stops.');
  });

  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const subject = urgent.length
    ? `${urgent.some((u) => u.startsWith('URGENT')) ? 'URGENT - ' : ''}Steer Me nightly check: ${urgent.length} item(s) need attention`
    : 'Steer Me nightly check: all clear';
  const text = [`Steer Me nightly check - ${when} Central`, '', 'NEEDS ATTENTION', ...(urgent.length ? urgent.map((u) => `- ${u}`) : ['- Nothing needs attention.']), '', 'CHECKS', ...lines.map((l) => `- ${l}`),
    ...(details.length ? ['', 'SIGN-UP DETAIL', ...details.map((d) => `- ${d}`)] : []),
    ...(failed.length ? ['', `COULD NOT CHECK: ${failed.join(', ')}`] : []), '', 'Sent by the Supabase nightly job. If this email ever fails to arrive by about 7 PM Central, the job itself is broken - tell Claude.'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;color:#1E140F">${text.split('\n').map((l) => l.startsWith('- ') ? `<div style="margin:3px 0 3px 14px">&bull; ${esc(l.slice(2))}</div>` : l && l === l.toUpperCase() && l.length < 24 ? `<h3 style="margin:16px 0 4px">${esc(l)}</h3>` : `<div>${esc(l) || '&nbsp;'}</div>`).join('')}</div>`;

  if (dryRun) return Response.json({ subject, text });
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return Response.json({ error: 'RESEND_API_KEY not set', subject }, { status: 500 });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [toOverride ?? TO], subject, html, text }),
  });
  if (!res.ok) { console.error('Resend failed', res.status, await res.text()); return Response.json({ error: 'email failed', status: res.status, subject }, { status: 502 }); }
  const sentJson = await res.json().catch(() => ({}));
  return Response.json({ sent: true, resend_id: sentJson.id, to: toOverride ?? TO, subject, urgent: urgent.length });
});
