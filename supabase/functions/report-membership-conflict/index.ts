// NEW, added 2026-08-18 - the proactive half of migration 0056. Before
// this, a blocked sign-up/classification-update (migration 0031's unique
// constraint on global_membership_id) just showed the blocked person a
// "contact support" toast and nothing else happened - the attempt was
// never recorded anywhere, and the person who legitimately holds that
// membership ID never found out someone tried to claim it unless the
// blocked person happened to email in. RUNBOOK.md's own "Reviewing a
// suspected identity/classification conflict" section only ever got read
// reactively as a result.
//
// Called directly by the client (sign-up.tsx / update-classification.tsx)
// the moment their profiles insert/update comes back with a 23505
// unique_violation on global_membership_id - see verification.ts's
// reportMembershipConflict() for the shared call shape. Does two things:
//   1. Writes a row to membership_id_conflicts so a human reviewer has a
//      real queue to work from instead of waiting on a support email.
//   2. Emails BOTH parties immediately and honestly - the existing
//      account holder ("someone just tried to use your ID"), and the
//      blocked person ("your ID's already claimed, here's what happens
//      next") - the same "be honest with both parties" principle the
//      user asked for directly, rather than silently investigating
//      behind the scenes.
//
// Verified below via the caller's own auth JWT so this can't be hit
// anonymously - same pattern as verify-classification-card.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
// Same dedicated send-only domain as send-welcome-email (real inbox mail
// can't originate from ropingtools.com/duratex-ie.com - both sit on Wix
// nameservers, which don't expose the DNS control a sending domain needs).
const FROM_ADDRESS = 'Steer Me Trust & Safety <trust@ropingtoolsmail.com>';
const REPLY_TO = 'support@ropingtools.com';

type ConflictRequest = {
  membershipId: string;
  claimedName: string;
  position: string;
  screenshotPath: string | null;
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  // Abuse ceiling, not a real usage cap - a real person hits this at most
  // once or twice (they mistyped their own ID, or a genuine conflict) -
  // 5/day comfortably covers retries without being a meaningful cap on a
  // scripted loop trying to spam another account's inbox.
  const allowed = await checkRateLimit(`user:${callerData.user.id}`, 'report_membership_conflict', 5, 1440);
  if (!allowed) {
    return Response.json({ error: 'Too many requests - try again later.' }, { status: 429 });
  }

  let body: ConflictRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (!body.membershipId || !body.claimedName || !body.position) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const normalized = normalizeId(body.membershipId);
  const supabaseAdmin = createSupabaseAdmin();

  const { data: existingProfile, error: lookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('global_membership_id_normalized', normalized)
    .neq('id', callerData.user.id)
    .maybeSingle();

  if (lookupError) {
    console.error('membership conflict lookup failed', lookupError);
    return Response.json({ logged: false, reason: 'Lookup failed' });
  }
  if (!existingProfile) {
    // Race: the conflict already resolved (e.g. the existing account was
    // just freed up) between the blocked insert and this call. Nothing to
    // log - the client should just let the person retry submission.
    return Response.json({ logged: false, reason: 'No conflicting account found' });
  }

  const { data: conflictRow, error: insertError } = await supabaseAdmin
    .from('membership_id_conflicts')
    .insert({
      membership_id_normalized: normalized,
      existing_profile_id: existingProfile.id,
      attempted_by_user_id: callerData.user.id,
      attempted_name: body.claimedName,
      attempted_position: body.position,
      attempted_screenshot_path: body.screenshotPath,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('membership conflict insert failed', insertError);
    return Response.json({ logged: false, reason: 'Could not log conflict' });
  }

  // Emailing both parties is a best-effort layer on top of the row above,
  // which is the part that actually matters for review - same "don't let
  // our own infrastructure block/fail the important part" principle used
  // throughout this project's Edge Functions.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log('RESEND_API_KEY not set yet - conflict logged without notification emails', conflictRow.id);
    return Response.json({ logged: true, notified: false });
  }

  const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(existingProfile.id);
  const existingEmail = existingUser?.user?.email ?? null;
  const attemptedEmail = callerData.user.email ?? null;

  const results = await Promise.allSettled([
    existingEmail
      ? sendEmail(apiKey, existingEmail, 'Someone just tried to use your Global Membership ID', existingHolderEmailHtml(existingProfile.full_name))
      : Promise.resolve(),
    attemptedEmail
      ? sendEmail(apiKey, attemptedEmail, "We couldn't verify your Global Membership ID", blockedAttemptEmailHtml(body.claimedName))
      : Promise.resolve(),
  ]);
  const notified = results.every((r) => r.status === 'fulfilled');
  if (!notified) {
    console.error('membership conflict notification emails partially failed', results);
  }

  return Response.json({ logged: true, notified });
});

// Same normalization verify-classification-card's own normalizeId() uses,
// and matches migration 0056's generated global_membership_id_normalized
// column exactly - must stay in sync with both.
function normalizeId(id: string): string {
  return id.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${text}`);
  }
}

function emailShell(bodyHtml: string): string {
  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F4F1EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E4DDD0;">
          <tr>
            <td style="background:#241811;padding:24px 32px;">
              <span style="color:#E8D9B8;font-size:20px;font-weight:700;letter-spacing:0.5px;">Steer Me</span>
              <div style="color:#B9A57C;font-size:12px;margin-top:2px;">Trust &amp; Safety</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#2A2420;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#F4F1EC;color:#8A8175;font-size:12px;line-height:1.5;border-top:1px solid #E4DDD0;">
              Questions any time: <a href="mailto:support@ropingtools.com" style="color:#8A5A2B;">support@ropingtools.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function existingHolderEmailHtml(existingName: string): string {
  const firstName = (existingName || '').trim().split(/\s+/)[0] || 'there';
  return emailShell(`
    <p style="margin:0 0 16px;">Hey ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">
      Someone just tried to create or update a Steer Me account using your Global Handicap membership ID.
      We blocked it automatically - only one Steer Me account can ever be linked to a given membership ID at a time.
    </p>
    <p style="margin:0 0 16px;">
      <strong>If this wasn't you, no action is needed right now.</strong> We've logged the attempt and our team
      will review it.
    </p>
    <p style="margin:0 0 16px;">
      If you think this might genuinely be your own mix-up (for example, you created a second account by
      mistake), reply to this email or contact
      <a href="mailto:support@ropingtools.com" style="color:#8A5A2B;">support@ropingtools.com</a> and we'll help
      sort it out.
    </p>
    <p style="margin:24px 0 4px;">Thanks for keeping Steer Me honest,</p>
    <p style="margin:0;font-weight:700;color:#241811;">The Steer Me Team</p>
  `);
}

function blockedAttemptEmailHtml(claimedName: string): string {
  const firstName = (claimedName || '').trim().split(/\s+/)[0] || 'there';
  return emailShell(`
    <p style="margin:0 0 16px;">Hey ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;">
      The Global Handicap membership ID you entered is already linked to another Steer Me account, so we
      couldn't finish your sign-up (or classification update).
    </p>
    <p style="margin:0 0 16px;">
      This sometimes happens as an honest mistake - a typo, or re-entering your own ID on a second account by
      accident. It can also mean someone else is using your identity, which is why we take every one of these
      seriously and review them by hand rather than resolving them automatically.
    </p>
    <p style="margin:0 0 16px;">
      <strong>We've also notified the existing account holder</strong> so both sides of this are informed, not
      just one.
    </p>
    <p style="margin:0 0 16px;">
      If this is genuinely your own membership ID, reply to this email or contact
      <a href="mailto:support@ropingtools.com" style="color:#8A5A2B;">support@ropingtools.com</a> with a clear
      photo of your card and we'll help verify and resolve it as quickly as we can.
    </p>
    <p style="margin:24px 0 4px;">Thanks for your patience,</p>
    <p style="margin:0;font-weight:700;color:#241811;">The Steer Me Team</p>
  `);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
