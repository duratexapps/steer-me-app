// Free weekly "ropings near you" email (roping alerts, phase 1; migration 0128). Called by pg_cron through
// run_weekly_roping_list() on Mondays at 12:00 and 13:00 UTC; it sends only when it is 7 AM Monday in America/Chicago,
// so the right one of the two fires in both daylight and standard time.
//
// Safety switches (app_settings): `weekly_alerts_enabled` must be true AND `alerts_mailing_address` must be filled in
// (bulk email must carry a postal address) before anything goes to members. Test sends (testTo) and dry runs ignore the
// switch. Test, demo, staff and suspended accounts are never emailed. A member who already got this list in the last
// 5 days is skipped, so a double cron firing cannot send twice. Auth: the shared x-webhook-secret header.
//
// Body: { dryRun?: boolean, testTo?: string, userId?: string, force?: boolean }
//   dryRun  - builds every list, sends and writes nothing, returns counts only (no names or addresses).
//   testTo  - sends ONE member's list (userId) to this address instead of theirs; ignores the switch and the 7 AM check.
//   force   - skips the Monday 7 AM check; honoured only together with dryRun or testTo.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = 'Steer Me <notifications@ropingtoolsmail.com>';
const REPLY_TO = 'ropingtools@duratex-ie.com';
const SITE = 'https://steerme.ropingtools.com';
const INTERNAL = /(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$/i;
const MAX_DISTANCE_LOOKUPS = 25; // paid Google lookups per run, a small slice of the shared 300/day cap that protects the Events screen; everything else comes from the town_distances cache
const MAX_EVENTS_IN_EMAIL = 12;

type Row = Record<string, any>;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chicagoNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')) % 24, date: `${get('year')}-${get('month')}-${get('day')}` };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stateOf(town: string | null | undefined): string | null {
  const m = (town ?? '').trim().match(/,\s*([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : null;
}

function dateLabel(date: string, end: string | null): string {
  const fmt = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return end && end !== date ? `${fmt(date)} to ${fmt(end)}` : fmt(date);
}

function classesLabel(divisions: unknown): string {
  if (!Array.isArray(divisions)) return '';
  const nums = divisions.map(Number).filter((n) => Number.isFinite(n) && n !== 19);
  return nums.map((n) => `#${n}`).join(', ');
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  let body: { dryRun?: boolean; testTo?: string; userId?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* an empty body is fine */ }
  const dryRun = !!body.dryRun;
  const testTo = body.testTo?.trim() || null;
  const isTest = !!testTo;
  if (isTest && !body.userId) return Response.json({ error: 'testTo needs userId' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiKey = Deno.env.get('RESEND_API_KEY');

  const now = chicagoNow();
  const checkTime = !(body.force && (dryRun || isTest));
  if (checkTime && !(now.weekday === 'Mon' && now.hour === 7)) {
    return Response.json({ skipped: true, reason: `not Monday 7 AM Central (it is ${now.weekday} ${now.hour}:00)` });
  }

  const { data: settingRows } = await admin.from('app_settings').select('key, value').in('key', ['weekly_alerts_enabled', 'alerts_mailing_address']);
  const settings = Object.fromEntries((settingRows ?? []).map((r: Row) => [r.key, r.value]));
  const address = typeof settings.alerts_mailing_address === 'string' ? settings.alerts_mailing_address.trim() : '';
  const bulk = !dryRun && !isTest;
  if (bulk && settings.weekly_alerts_enabled !== true) return Response.json({ skipped: true, reason: 'weekly_alerts_enabled is off' });
  if (bulk && !address) return Response.json({ skipped: true, reason: 'alerts_mailing_address is empty' });
  if (!dryRun && !apiKey) return Response.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  // Events overlapping today through the next 6 days (Monday through Sunday).
  const today = now.date;
  const last = addDays(today, 6);
  const { data: eventRows, error: evErr } = await admin
    .from('events')
    .select('id, name, event_date, event_end_date, location, entry_fee, divisions, is_clinic, is_practice')
    .eq('status', 'published')
    .is('private_to_user_id', null)
    .lte('event_date', last)
    .or(`event_end_date.gte.${today},event_date.gte.${today}`)
    .limit(1500);
  if (evErr) return Response.json({ error: `events query failed: ${evErr.message}` }, { status: 500 });
  const events: Row[] = eventRows ?? [];

  // Members.
  let q = admin.from('profiles').select('id, full_name, home_area').eq('is_demo', false).eq('suspended', false).eq('scrubbed', false).not('home_area', 'is', null);
  if (body.userId) q = q.eq('id', body.userId);
  const { data: memberRows, error: mErr } = await q.limit(5000);
  if (mErr) return Response.json({ error: `profiles query failed: ${mErr.message}` }, { status: 500 });
  const members: Row[] = memberRows ?? [];
  const ids = members.map((m) => m.id);

  const { data: prefRows } = ids.length ? await admin.from('alert_prefs').select('*').in('user_id', ids) : { data: [] as Row[] };
  const prefs = new Map<string, Row>((prefRows ?? []).map((p: Row) => [p.user_id, p]));

  // Members with no settings row yet get the defaults, and a row so their unsubscribe token exists.
  const missing = ids.filter((id) => !prefs.has(id));
  if (missing.length && !dryRun) {
    const { data: created } = await admin.from('alert_prefs').insert(missing.map((user_id) => ({ user_id }))).select('*');
    for (const p of created ?? []) prefs.set(p.user_id, p);
  }
  const prefsFor = (id: string): Row => prefs.get(id) ?? { weekly: true, radius_miles: 250, include_jackpots: true, include_clinics: true, include_practices: true, class_min: null, class_max: null, unsubscribe_token: null };

  // Email addresses.
  const emails = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }

  // Distances: cached driving miles per (home, event town). Misses go to get-town-distance, capped per run.
  const homeAreas = [...new Set(members.map((m) => m.home_area as string))];
  const eventTowns = [...new Set(events.map((e) => e.location as string))];
  const miles = new Map<string, Map<string, number>>();
  for (const home of homeAreas) {
    const map = new Map<string, number>();
    const [a, b] = await Promise.all([
      admin.from('town_distances').select('destination_town, miles').eq('origin_town', home),
      admin.from('town_distances').select('origin_town, miles').eq('destination_town', home),
    ]);
    for (const r of a.data ?? []) map.set(r.destination_town, Number(r.miles));
    for (const r of b.data ?? []) map.set(r.origin_town, Number(r.miles));
    map.set(home, 0);
    miles.set(home, map);
  }
  const needsDistance = new Set(members.filter((m) => prefsFor(m.id).radius_miles != null).map((m) => m.home_area as string));
  const pending: { home: string; town: string }[] = [];
  for (const home of needsDistance) for (const town of eventTowns) if (!miles.get(home)!.has(town)) pending.push({ home, town });
  const toLookUp = pending.slice(0, MAX_DISTANCE_LOOKUPS);
  const lookups = toLookUp.length;
  // Small parallel batches: a few hundred sequential lookups would not finish inside the function's time limit.
  for (let i = 0; i < toLookUp.length; i += 5) {
    await Promise.all(toLookUp.slice(i, i + 5).map(async ({ home, town }) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/get-town-distance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ townA: home, townB: town }),
        });
        const j = await res.json().catch(() => ({}));
        if (typeof j.miles === 'number') miles.get(home)!.set(town, j.miles);
      } catch { /* unknown distance: handled below */ }
    }));
  }

  const stats = { members: members.length, events: events.length, optedOut: 0, noEmail: 0, internal: 0, noEvents: 0, recentlySent: 0, sent: 0, failed: 0, wouldSend: 0, lookups };

  // Skip anyone already sent this list in the last 5 days.
  const sinceIso = new Date(Date.now() - 5 * 86400000).toISOString();
  const { data: recent } = bulk && ids.length ? await admin.from('notification_log').select('user_id').eq('kind', 'weekly_list').gte('created_at', sinceIso).in('user_id', ids) : { data: [] as Row[] };
  const recentSet = new Set((recent ?? []).map((r: Row) => r.user_id));

  for (const m of members) {
    const p = prefsFor(m.id);
    if (!isTest && p.weekly === false) { stats.optedOut++; continue; }
    const email = emails.get(m.id) ?? '';
    if (!email) { stats.noEmail++; continue; }
    if (!isTest && INTERNAL.test(email)) { stats.internal++; continue; }
    if (bulk && recentSet.has(m.id)) { stats.recentlySent++; continue; }

    const map = miles.get(m.home_area) ?? new Map<string, number>();
    const homeState = stateOf(m.home_area);
    const picked = events
      .filter((e) => {
        const kind = e.is_clinic ? 'clinics' : e.is_practice ? 'practices' : 'jackpots';
        if (!p[`include_${kind}`]) return false;
        if (kind === 'jackpots' && (p.class_min != null || p.class_max != null)) {
          const nums = Array.isArray(e.divisions) ? e.divisions.map(Number).filter((n: number) => Number.isFinite(n) && n !== 19) : [];
          if (nums.length === 0) return false;
          if (!nums.some((n: number) => (p.class_min == null || n >= Number(p.class_min)) && (p.class_max == null || n <= Number(p.class_max)))) return false;
        }
        if (p.radius_miles == null) return true;
        const d = map.get(e.location);
        if (typeof d === 'number') return d <= p.radius_miles;
        return stateOf(e.location) !== null && stateOf(e.location) === homeState; // distance unknown: same state only
      })
      .map((e) => ({ ...e, miles: map.get(e.location) }))
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.miles ?? 9999) - (b.miles ?? 9999));

    if (picked.length === 0) { stats.noEvents++; continue; }
    if (dryRun) { stats.wouldSend++; continue; }

    const shown = picked.slice(0, MAX_EVENTS_IN_EMAIL);
    const more = picked.length - shown.length;
    const first = (m.full_name || '').trim().split(/\s+/)[0] || 'there';
    const link = `${SITE}/events?dateWindow=week${p.radius_miles != null ? `&maxMiles=${p.radius_miles}` : ''}`;
    const unsub = p.unsubscribe_token ? `${supabaseUrl}/functions/v1/alerts-unsubscribe?t=${p.unsubscribe_token}` : `${SITE}/alerts`;
    const itemsHtml = shown.map((e) => {
      const tag = e.is_clinic ? 'Clinic' : e.is_practice ? 'Practice' : '';
      const bits = [dateLabel(e.event_date, e.event_end_date), e.location, typeof e.miles === 'number' && e.miles > 0 ? `about ${Math.round(e.miles)} mi` : '', classesLabel(e.divisions), e.entry_fee ?? ''].filter(Boolean);
      return `<li style="margin:0 0 12px"><strong>${esc(e.name)}</strong>${tag ? ` <span style="color:#6b5a48">(${tag})</span>` : ''}<br><span style="color:#6b5a48;font-size:13.5px">${bits.map(esc).join(' · ')}</span></li>`;
    }).join('');
    const itemsText = shown.map((e) => {
      const bits = [dateLabel(e.event_date, e.event_end_date), e.location, typeof e.miles === 'number' && e.miles > 0 ? `about ${Math.round(e.miles)} mi` : '', classesLabel(e.divisions), e.entry_fee ?? ''].filter(Boolean);
      return `- ${e.name}\n  ${bits.join(' · ')}`;
    }).join('\n');
    const subject = `${picked.length} roping${picked.length === 1 ? '' : 's'} near you this week`;
    const footerAddr = address || 'Steer Me';
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1E140F;line-height:1.55;font-size:15px">
<p>Hi ${esc(first)},</p><p>Here's what's posted near ${esc(m.home_area)} for the week ahead.</p>
<ul style="padding-left:18px;margin:12px 0">${itemsHtml}</ul>
${more > 0 ? `<p style="color:#6b5a48">Plus ${more} more in the app.</p>` : ''}
<p><a href="${esc(link)}" style="display:inline-block;background:#A5823F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">See them in Steer Me</a></p>
<p style="color:#6b5a48;font-size:12.5px">Confirm details with the producer before you haul. Fees and times come from each producer's flier.</p>
<p style="color:#6b5a48;font-size:12.5px;border-top:1px solid #e5dccb;padding-top:10px">You get this free weekly list because you have a Steer Me account. Change your distance and types in Steer Me under Profile, Roping alerts, or <a href="${esc(unsub)}" style="color:#6b5a48">unsubscribe</a> in one tap.<br>${esc(footerAddr)}</p></div>`;
    const text = `Hi ${first},\n\nHere's what's posted near ${m.home_area} for the week ahead.\n\n${itemsText}\n${more > 0 ? `\nPlus ${more} more in the app.\n` : ''}\nSee them in Steer Me: ${link}\n\nConfirm details with the producer before you haul.\n\nYou get this free weekly list because you have a Steer Me account. Change it in the app under Profile, Roping alerts, or unsubscribe: ${unsub}\n${footerAddr}`;

    let emailStatus = 'failed';
    let detail = '';
    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: [testTo ?? email], reply_to: REPLY_TO, subject, html, text,
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      });
      if (res.ok) { emailStatus = 'sent'; stats.sent++; } else { stats.failed++; detail = `${res.status} ${(await res.text()).slice(0, 160)}`; }
    } catch (e) { stats.failed++; detail = e instanceof Error ? e.message.slice(0, 160) : 'error'; }
    // A test send writes no log row, so it can never make the real Monday send skip that member.
    if (!isTest) {
      try {
        await admin.from('notification_log').insert({ kind: 'weekly_list', user_id: m.id, email_status: emailStatus, detail: `${picked.length} events${detail ? `; ${detail}` : ''}` });
      } catch { /* logging must never block sending */ }
    }
  }

  return Response.json({ ok: true, dryRun, isTest, ...stats });
});
