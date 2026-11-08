// Instant roping alerts for PAYING members (roping alerts, phase 2; migration 0129). Called every 15 minutes by pg_cron through
// run_instant_roping_alerts(). A member gets a push (when they have a token) and an email the moment a roping that matches their
// alert settings is added. Plan: DOCS/plan-a-roping-alerts-first-paid-feature-2026-11-07.md.
//
// Who gets one: alert_prefs.instant = true AND is_paying_member (store, Stripe or comped; NOT the free-tier rule that
// has_active_subscription() uses). Only ropings created AFTER the member turned instant on (alert_prefs.instant_since) are sent,
// and alert_sends makes sure the same roping never goes to the same member twice.
//
// Delivery rules: nothing between 9 PM and 7 AM in the member's home-state time zone. At most 2 alert messages per rolling 24
// hours; anything beyond that waits and goes out as ONE email-only digest between 5 PM and 9 PM local time (at most one digest
// per 20 hours). Test, demo, staff and suspended accounts are never sent to. Changes to a roping already alerted send nothing.
//
// Safety switches (app_settings): `instant_alerts_enabled` must be true AND `alerts_mailing_address` set before anything goes to
// members. Auth: the shared x-webhook-secret header.
//
// Body: { dryRun?: boolean, testTo?: string, userId?: string }
//   dryRun - builds everything, sends and writes nothing, returns counts only.
//   testTo - sends ONE member's current matches (last 7 days, any paying state, no limits) to this address instead of theirs;
//            writes no alert_sends or log rows.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const FROM = 'Steer Me <notifications@ropingtoolsmail.com>';
const REPLY_TO = 'ropingtools@duratex-ie.com';
const SITE = 'https://steerme.ropingtools.com';
const INTERNAL = /(@steerme\.test|@steerme-demo\.com|@duratex-ie\.com|@example\.com)$/i;
const MAX_DISTANCE_LOOKUPS = 5; // paid Google lookups per run; the job runs every 15 minutes and shares the 300/day cap with the Events screen
const MAX_BATCHES_PER_DAY = 2;
const MAX_EVENTS_IN_MESSAGE = 8;

type Row = Record<string, any>;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Home-state time zones, used only for quiet hours and the evening digest. Anything unknown falls back to Central.
const TZ: Record<string, string> = {
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', IN: 'America/New_York', KY: 'America/New_York',
  MA: 'America/New_York', MD: 'America/New_York', ME: 'America/New_York', MI: 'America/New_York', NC: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  VA: 'America/New_York', VT: 'America/New_York', WV: 'America/New_York', DC: 'America/New_York', ON: 'America/Toronto', QC: 'America/Toronto', NB: 'America/Halifax', NS: 'America/Halifax',
  AL: 'America/Chicago', AR: 'America/Chicago', IA: 'America/Chicago', IL: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MO: 'America/Chicago', MS: 'America/Chicago', ND: 'America/Chicago', NE: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago', MB: 'America/Winnipeg', SK: 'America/Regina',
  CO: 'America/Denver', ID: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver', AB: 'America/Edmonton',
  AZ: 'America/Phoenix', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles', BC: 'America/Vancouver',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};

function stateOf(town: string | null | undefined): string | null {
  const m = (town ?? '').trim().match(/,\s*([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : null;
}

function localHour(home: string | null | undefined): number {
  const tz = TZ[stateOf(home) ?? ''] ?? 'America/Chicago';
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(new Date()).find((p) => p.type === 'hour')?.value ?? '12';
  return Number(h) % 24;
}

function todayCentral(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function dateLabel(date: string, end: string | null): string {
  const fmt = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return end && end !== date ? `${fmt(date)} to ${fmt(end)}` : fmt(date);
}

function classesLabel(divisions: unknown): string {
  if (!Array.isArray(divisions)) return '';
  return divisions.map(Number).filter((n) => Number.isFinite(n) && n !== 19).map((n) => `#${n}`).join(', ');
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  let body: { dryRun?: boolean; testTo?: string; userId?: string } = {};
  try { body = await req.json(); } catch { /* an empty body is fine */ }
  const dryRun = !!body.dryRun;
  const testTo = body.testTo?.trim() || null;
  const isTest = !!testTo;
  if (isTest && !body.userId) return Response.json({ error: 'testTo needs userId' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiKey = Deno.env.get('RESEND_API_KEY');

  const { data: settingRows } = await admin.from('app_settings').select('key, value').in('key', ['instant_alerts_enabled', 'alerts_mailing_address']);
  const settings = Object.fromEntries((settingRows ?? []).map((r: Row) => [r.key, r.value]));
  const address = typeof settings.alerts_mailing_address === 'string' ? settings.alerts_mailing_address.trim() : '';
  const bulk = !dryRun && !isTest;
  if (bulk && settings.instant_alerts_enabled !== true) return Response.json({ skipped: true, reason: 'instant_alerts_enabled is off' });
  if (bulk && !address) return Response.json({ skipped: true, reason: 'alerts_mailing_address is empty' });
  if (!dryRun && !apiKey) return Response.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  // Members who asked for instant alerts.
  let pq = admin.from('alert_prefs').select('*').eq('instant', true);
  if (body.userId) pq = pq.eq('user_id', body.userId);
  const { data: prefRows, error: pErr } = await pq.limit(5000);
  if (pErr) return Response.json({ error: `alert_prefs query failed: ${pErr.message}` }, { status: 500 });
  const prefs = new Map<string, Row>((prefRows ?? []).map((p: Row) => [p.user_id, p]));
  const wantIds = [...prefs.keys()];
  if (wantIds.length === 0) return Response.json({ ok: true, members: 0, note: 'nobody has instant alerts on' });

  // Paying members only (a test send skips this so a free account can be used to check the message).
  const paying = new Set<string>();
  if (!isTest) {
    const [c, s, st] = await Promise.all([
      admin.from('comped_users').select('user_id').in('user_id', wantIds),
      admin.from('subscriptions').select('id').eq('entitlement_active', true).in('id', wantIds),
      admin.from('stripe_subscriptions').select('user_id').eq('active', true).in('user_id', wantIds),
    ]);
    for (const r of c.data ?? []) paying.add(r.user_id);
    for (const r of s.data ?? []) paying.add(r.id);
    for (const r of st.data ?? []) paying.add(r.user_id);
  }

  let mq = admin
    .from('profiles')
    .select('id, full_name, home_area, expo_push_token, push_opted_out')
    .in('id', isTest ? wantIds : [...paying])
    .not('home_area', 'is', null);
  // A test send may use an owner or demo account; a real run never touches test, demo, suspended or scrubbed ones.
  if (!isTest) mq = mq.eq('is_demo', false).eq('suspended', false).eq('scrubbed', false);
  const { data: memberRows, error: mErr } = await mq;
  if (mErr) return Response.json({ error: `profiles query failed: ${mErr.message}` }, { status: 500 });
  const members: Row[] = memberRows ?? [];
  if (members.length === 0) return Response.json({ ok: true, members: 0, note: 'no paying member has instant alerts on' });
  const ids = members.map((m) => m.id);

  // Candidate ropings: added in the last 7 days and not over yet.
  const today = todayCentral();
  const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: eventRows, error: evErr } = await admin
    .from('events')
    .select('id, name, event_date, event_end_date, location, entry_fee, divisions, is_clinic, is_practice, created_at')
    .eq('status', 'published')
    .is('private_to_user_id', null)
    .gte('created_at', sinceIso)
    .or(`event_end_date.gte.${today},event_date.gte.${today}`)
    .limit(500);
  if (evErr) return Response.json({ error: `events query failed: ${evErr.message}` }, { status: 500 });
  const events: Row[] = eventRows ?? [];
  const stats = { members: members.length, candidates: events.length, quiet: 0, nothingNew: 0, held: 0, noEmail: 0, internal: 0, batches: 0, pushes: 0, emails: 0, failed: 0, digests: 0, lookups: 0 };
  if (events.length === 0) return Response.json({ ok: true, ...stats });

  // Already sent, and recent message counts.
  const { data: sentRows } = await admin.from('alert_sends').select('user_id, event_id').eq('channel', 'instant').in('user_id', ids).in('event_id', events.map((e) => e.id));
  const sentSet = new Set((sentRows ?? []).map((r: Row) => `${r.user_id}|${r.event_id}`));
  const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: logRows } = isTest ? { data: [] as Row[] } : await admin.from('notification_log').select('user_id, kind, created_at').in('kind', ['instant_alert', 'instant_digest']).gte('created_at', dayAgo).in('user_id', ids);
  const batchCount = new Map<string, number>();
  const lastDigest = new Map<string, number>();
  for (const r of logRows ?? []) {
    if (r.kind === 'instant_alert') batchCount.set(r.user_id, (batchCount.get(r.user_id) ?? 0) + 1);
    else lastDigest.set(r.user_id, Math.max(lastDigest.get(r.user_id) ?? 0, new Date(r.created_at).getTime()));
  }

  // Email addresses.
  const emails = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) if (u.email && ids.includes(u.id)) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }

  // Distances from the cache, with a few paid lookups per run for towns not seen before.
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
  const needsDistance = new Set(members.filter((m) => prefs.get(m.id)?.radius_miles != null).map((m) => m.home_area as string));
  const pendingLookups: { home: string; town: string }[] = [];
  for (const home of needsDistance) for (const town of eventTowns) if (!miles.get(home)!.has(town)) pendingLookups.push({ home, town });
  const toLookUp = isTest || !dryRun ? pendingLookups.slice(0, MAX_DISTANCE_LOOKUPS) : [];
  stats.lookups = toLookUp.length;
  await Promise.all(toLookUp.map(async ({ home, town }) => {
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

  for (const m of members) {
    const p = prefs.get(m.id)!;
    const email = emails.get(m.id) ?? '';
    if (!email) { stats.noEmail++; continue; }
    if (!isTest && INTERNAL.test(email)) { stats.internal++; continue; }

    const hour = localHour(m.home_area);
    const quiet = hour >= 21 || hour < 7;
    if (!isTest && quiet) { stats.quiet++; continue; }

    const since = p.instant_since ? new Date(p.instant_since).getTime() : Date.now();
    const map = miles.get(m.home_area) ?? new Map<string, number>();
    const homeState = stateOf(m.home_area);
    const picked = events
      .filter((e) => {
        if (!isTest && (new Date(e.created_at).getTime() <= since || sentSet.has(`${m.id}|${e.id}`))) return false;
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
        return stateOf(e.location) !== null && stateOf(e.location) === homeState;
      })
      .map((e) => ({ ...e, miles: map.get(e.location) }))
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    if (picked.length === 0) { stats.nothingNew++; continue; }

    // Daily cap: after 2 messages in 24 hours, hold everything for one email-only digest in the evening.
    const used = batchCount.get(m.id) ?? 0;
    let digest = false;
    if (!isTest && used >= MAX_BATCHES_PER_DAY) {
      const evening = hour >= 17 && hour < 21;
      const digestedRecently = Date.now() - (lastDigest.get(m.id) ?? 0) < 20 * 3600000;
      if (!evening || digestedRecently) { stats.held++; continue; }
      digest = true;
    }
    if (dryRun) { stats.batches++; continue; }

    const shown = picked.slice(0, MAX_EVENTS_IN_MESSAGE);
    const more = picked.length - shown.length;
    const first = (m.full_name || '').trim().split(/\s+/)[0] || 'there';
    const link = `${SITE}/events${p.radius_miles != null ? `?maxMiles=${p.radius_miles}` : ''}`;
    const unsub = p.unsubscribe_token ? `${supabaseUrl}/functions/v1/alerts-unsubscribe?t=${p.unsubscribe_token}` : `${SITE}/alerts`;
    const bits = (e: Row) => [dateLabel(e.event_date, e.event_end_date), e.location, typeof e.miles === 'number' && e.miles > 0 ? `about ${Math.round(e.miles)} mi` : '', classesLabel(e.divisions), e.entry_fee ?? ''].filter(Boolean);
    const itemsHtml = shown.map((e) => `<li style="margin:0 0 12px"><strong>${esc(e.name)}</strong>${e.is_clinic ? ' <span style="color:#6b5a48">(Clinic)</span>' : e.is_practice ? ' <span style="color:#6b5a48">(Practice)</span>' : ''}<br><span style="color:#6b5a48;font-size:13.5px">${bits(e).map(esc).join(' · ')}</span></li>`).join('');
    const itemsText = shown.map((e) => `- ${e.name}\n  ${bits(e).join(' · ')}`).join('\n');
    const single = picked.length === 1;
    const subject = single ? `New roping near you: ${picked[0].name}` : `${picked.length} new ropings near you`;
    const intro = digest ? `Here are the ropings added near ${m.home_area} since your last alert.` : `${single ? 'A roping was' : 'Ropings were'} just added near ${m.home_area}.`;
    const footerAddr = address || 'Steer Me';
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1E140F;line-height:1.55;font-size:15px">
<p>Hi ${esc(first)},</p><p>${esc(intro)}</p>
<ul style="padding-left:18px;margin:12px 0">${itemsHtml}</ul>
${more > 0 ? `<p style="color:#6b5a48">Plus ${more} more in the app.</p>` : ''}
<p><a href="${esc(link)}" style="display:inline-block;background:#A5823F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">See ${single ? 'it' : 'them'} in Steer Me</a></p>
<p style="color:#6b5a48;font-size:12.5px">Confirm details with the producer before you haul. Fees and times come from each producer's flier.</p>
<p style="color:#6b5a48;font-size:12.5px;border-top:1px solid #e5dccb;padding-top:10px">You get instant roping alerts as a Steer Me member. Change your distance and types in Steer Me under Profile, Roping alerts, or <a href="${esc(unsub)}" style="color:#6b5a48">turn alerts off</a> in one tap.<br>${esc(footerAddr)}</p></div>`;
    const text = `Hi ${first},\n\n${intro}\n\n${itemsText}\n${more > 0 ? `\nPlus ${more} more in the app.\n` : ''}\nSee ${single ? 'it' : 'them'} in Steer Me: ${link}\n\nConfirm details with the producer before you haul.\n\nYou get instant roping alerts as a Steer Me member. Change them in the app under Profile, Roping alerts, or turn them off: ${unsub}\n${footerAddr}`;

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
      if (res.ok) { emailStatus = 'sent'; stats.emails++; } else { stats.failed++; detail = `${res.status} ${(await res.text()).slice(0, 160)}`; }
    } catch (e) { stats.failed++; detail = e instanceof Error ? e.message.slice(0, 160) : 'error'; }

    // Push: only for a normal (non-digest) message, when the member has a token and has not turned push off.
    let pushStatus = 'skipped';
    if (!digest && !isTest) {
      if (!m.expo_push_token) pushStatus = 'no_token';
      else if (m.push_opted_out) pushStatus = 'opted_out';
      else {
        try {
          const res = await fetch(EXPO_PUSH_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              to: m.expo_push_token,
              title: single ? 'New roping near you' : `${picked.length} new ropings near you`,
              body: single ? `${picked[0].name} · ${bits(picked[0]).slice(0, 2).join(' · ')}` : shown.slice(0, 3).map((e) => e.name).join(', ') + (picked.length > 3 ? ' and more' : ''),
              data: { screen: 'events' },
            }),
          });
          if (res.ok) { pushStatus = 'sent'; stats.pushes++; } else { pushStatus = 'failed'; }
        } catch { pushStatus = 'failed'; }
      }
    }

    // Test sends write nothing, so they can never make a real alert skip a roping.
    if (!isTest) {
      try {
        if (emailStatus === 'sent' || pushStatus === 'sent') {
          await admin.from('alert_sends').upsert(picked.map((e) => ({ user_id: m.id, event_id: e.id, channel: 'instant' })), { onConflict: 'user_id,event_id,channel', ignoreDuplicates: true });
          if (digest) stats.digests++; else stats.batches++;
        }
        await admin.from('notification_log').insert({
          kind: digest ? 'instant_digest' : 'instant_alert', user_id: m.id, push_status: pushStatus, email_status: emailStatus,
          detail: `${picked.length} events${detail ? `; ${detail}` : ''}`,
        });
      } catch { /* logging must never block sending */ }
    }
  }

  return Response.json({ ok: true, dryRun, isTest, ...stats });
});
