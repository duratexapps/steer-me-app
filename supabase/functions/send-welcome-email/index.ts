// Invoked by the profiles_notify_welcome_email trigger (migration
// 0051_welcome_email_webhook.sql) the moment a new user finishes signing up
// (profiles INSERT). Sends a one-time branded welcome email via Resend.
// Same "don't punish the user for our own infrastructure" principle used
// elsewhere in this project (verify-classification-card,
// extract-flier-contact-info): if RESEND_API_KEY isn't set yet, or the send
// fails, this degrades to a no-op/log rather than ever blocking or erroring
// out account creation, which already succeeded before this function is
// even called.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
// ropingtools.com and duratex-ie.com are both on Wix nameservers, which
// don't support the MX/DKIM records a sending domain needs (confirmed live
// 2026-08-11 - Wix Support: "not possible to change name servers for a Wix
// domain... you'll need to transfer your domain away from Wix"). Rather
// than a multi-day domain transfer, ropingtoolsmail.com was registered
// specifically as a dedicated send-only domain with normal DNS control.
// Reply-To still routes to the real support inbox below.
const FROM_ADDRESS = 'Steer Me <welcome@ropingtoolsmail.com>';
const REPLY_TO = 'support@ropingtools.com';
// Social icon PNGs for the header/footer below, hosted in a dedicated
// public bucket (email-assets) rather than reusing avatars/event-fliers -
// those are scoped to per-user/per-event uploads with their own RLS
// conventions, this is static site branding with no owner. Must be a
// hosted URL, not a data: URI - confirmed via raw message source
// (X-MS-Exchange-* headers) that the real recipient mailbox is
// Exchange/Outlook, whose Word-based rendering engine never supports
// data: URI images. The icons were also loading correctly the whole time
// under the hosted-URL approach; they just rendered far smaller than
// their width/height attrs because the source PNGs (qlmanage-rasterized
// from SVG) had wide transparent padding around the visible badge, so
// scaling the padded canvas down to 28px shrank the visible mark to
// near-nothing. Regenerated with PIL so the badge fills the canvas
// edge-to-edge, matching how a normal social-icon asset is built.
const EMAIL_ASSETS_BASE = 'https://ryjjwtsoeqyaiveslrat.supabase.co/storage/v1/object/public/email-assets';
// Real, live Play Store listing (confirmed 2026-08-16 - searchable, not
// just the closed-tester group this was originally built for) - see
// AndroidTesterBanner.tsx's own comment for the same update on the web
// side. No iOS listing exists yet, so that side stays a plain mention,
// never a link.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.duratexapplications.steerme';

Deno.serve(async (req) => {
  // FIXED live 2026-08-17, security review finding: `secret &&` meant a
  // missing/misconfigured DB_WEBHOOK_SECRET made this check a no-op - see
  // ban-suspended-user/index.ts's matching comment for the full reasoning.
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: {
    type: string;
    table: string;
    record: { id: string; full_name: string | null; referral_code: string | null };
  };

  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (payload.table !== 'profiles' || !payload.record?.id) {
    return Response.json({ skipped: true });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log('RESEND_API_KEY not set yet - skipping welcome email for', payload.record.id);
    return Response.json({ skipped: true, reason: 'Email sending not configured yet' });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(payload.record.id);
  if (userError || !userData?.user?.email) {
    console.error('Could not resolve email for new profile', payload.record.id, userError);
    return Response.json({ skipped: true, reason: 'Could not resolve user email' });
  }

  const firstName = (payload.record.full_name || '').trim().split(/\s+/)[0] || 'there';

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [userData.user.email],
        reply_to: REPLY_TO,
        subject: 'Welcome to Steer Me',
        html: welcomeEmailHtml(firstName, payload.record.referral_code),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Resend send failed', res.status, text);
      return Response.json({ skipped: true, reason: 'Send failed' });
    }
  } catch (err) {
    console.error('Resend send threw', err);
    return Response.json({ skipped: true, reason: 'Send threw' });
  }

  return Response.json({ sent: true, to: userData.user.email });
});

function welcomeEmailHtml(firstName: string, referralCode: string | null): string {
  const referralBlock = referralCode
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F0DE;border:1px solid #E3D6AE;border-radius:8px;margin:8px 0 20px;">
                <tr>
                  <td style="padding:16px 18px;color:#5C4A1E;font-size:14px;line-height:1.55;">
                    <strong>Know another roper who'd use this?</strong> Share your referral code
                    <strong>${escapeHtml(referralCode)}</strong> - once they sign up and subscribe, you both get a
                    free month, automatically. Find it any time under Refer a Friend in the app.
                  </td>
                </tr>
              </table>`
    : '';

  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F4F1EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E4DDD0;">
          <tr>
            <td style="background:#241811;padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" valign="middle">
                    <span style="color:#E8D9B8;font-size:22px;font-weight:700;letter-spacing:0.5px;">Steer Me</span>
                    <div style="color:#B9A57C;font-size:13px;margin-top:4px;">Team roping, simplified</div>
                  </td>
                  <td align="right" valign="middle">
                    <a href="https://www.facebook.com/profile.php?id=61592718599064" style="display:inline-block;margin-left:10px;"><img src="${EMAIL_ASSETS_BASE}/fb-header.png" width="28" height="28" alt="Facebook" style="display:block;border:0;border-radius:50%;"></a>
                    <a href="https://x.com/ropingtools" style="display:inline-block;margin-left:10px;"><img src="${EMAIL_ASSETS_BASE}/x-header.png" width="28" height="28" alt="X" style="display:block;border:0;border-radius:50%;"></a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#2A2420;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hey ${escapeHtml(firstName)},</p>

              <p style="margin:0 0 16px;">
                Thanks for downloading Steer Me and creating an account — glad to have you. We wanted to
                say Hi and give you the lay of the land.
              </p>

              <p style="margin:0 0 16px;">
                We're still in a testing phase right now, so everything is completely free to use, and
                you'll notice the user count is small — that's just because we're brand new, not because
                anything's wrong. Explore around, and if you run into any bugs, glitches, or anything that
                seems off, we'd genuinely appreciate hearing about it. Just email
                <a href="mailto:support@ropingtools.com" style="color:#8A5A2B;">support@ropingtools.com</a>
                and we'll take a look.
              </p>

              <p style="margin:0 0 16px;">
                If you like what you see, tell your fellow ropers about us. This app is built for team
                ropers, by team ropers, and we look forward to growing it with you.
              </p>

              <p style="margin:24px 0 8px;font-weight:700;color:#241811;">What you can do in Steer Me:</p>
              <ul style="margin:0 0 16px;padding-left:20px;">
                <li style="margin-bottom:8px;">Browse upcoming ropings cross-posted from producers, with real attendance counts.</li>
                <li style="margin-bottom:8px;">Find and message potential partners by classification.</li>
                <li style="margin-bottom:8px;">Enter a producer's draw right from the event card — skip the blind-draw fee at the window.</li>
                <li style="margin-bottom:8px;">Track your team number and live, round-by-round results — times, penalties, broken barriers, one-leg catches, No Time.</li>
                <li style="margin-bottom:8px;">Accept or decline extra-run charges right from your phone.</li>
                <li style="margin-bottom:8px;">Cancel your own entry before the draw, no phone call needed.</li>
                <li style="margin-bottom:8px;">Post a "looking for a partner" request tied to a specific event.</li>
              </ul>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F0DE;border:1px solid #E3D6AE;border-radius:8px;margin:8px 0 20px;">
                <tr>
                  <td style="padding:16px 18px;color:#5C4A1E;font-size:14px;line-height:1.55;">
                    <strong>One thing worth knowing:</strong> live team numbers, online entry, and
                    round-by-round results only work for events whose producer is actually using Draw Pro
                    to run their books. If you're participating in an event and would like all the benefits
                    of the platform, ask the producer to use Draw Pro, or contact us at
                    <a href="mailto:support@ropingtools.com" style="color:#5C4A1E;">support@ropingtools.com</a>.
                  </td>
                </tr>
              </table>
${referralBlock}
              <p style="margin:0 0 16px;">
                The real app is live on
                <a href="${PLAY_STORE_URL}" style="color:#8A5A2B;font-weight:700;">Google Play</a>
                — an iPhone version is coming soon.
              </p>

              <p style="margin:0 0 4px;">See you at the arena,</p>
              <p style="margin:0 0 18px;font-weight:700;color:#241811;">The Steer Me Team</p>

              <p style="margin:0;color:#5C4F42;font-size:13.5px;">
                Follow us on
                <a href="https://www.facebook.com/profile.php?id=61592718599064" style="display:inline-block;vertical-align:middle;margin:0 4px;"><img src="${EMAIL_ASSETS_BASE}/fb-footer.png" width="22" height="22" alt="Facebook" style="display:inline-block;vertical-align:middle;border:0;border-radius:50%;"></a>
                <a href="https://x.com/ropingtools" style="display:inline-block;vertical-align:middle;margin:0 4px;"><img src="${EMAIL_ASSETS_BASE}/x-footer.png" width="22" height="22" alt="X" style="display:inline-block;vertical-align:middle;border:0;border-radius:50%;"></a>
                to stay up to date &amp; find special offers.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#F4F1EC;color:#8A8175;font-size:12px;line-height:1.5;border-top:1px solid #E4DDD0;">
              You're receiving this because you created a Steer Me account. Questions or feedback any time:
              <a href="mailto:support@ropingtools.com" style="color:#8A5A2B;">support@ropingtools.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
