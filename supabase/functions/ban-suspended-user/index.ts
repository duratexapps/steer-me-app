// Invoked by a Supabase Database Webhook configured in Studio to fire on
// `profiles` UPDATE OF suspended WHEN NEW.suspended = true (see
// supabase/RUNBOOK.md for the exact setup steps). SQL triggers (migration
// 0012_reports.sql) already flip profiles.suspended for both the immediate
// minor-solicitation case and the 3rd-confirmed-report case; this function
// is the only place that can reach the Auth admin API to actually lock the
// underlying login, since plain SQL can't call it.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

// ~100 years - effectively permanent without using a magic "forever" value
// that some client libraries mis-handle.
const PERMANENT_BAN_DURATION = '876000h';

Deno.serve(async (req) => {
  const secret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: {
    type: string;
    table: string;
    record: { id: string; suspended: boolean };
    old_record?: { suspended: boolean };
  };

  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (payload.table !== 'profiles' || !payload.record?.suspended) {
    // Defensive no-op: only act on an actual suspend transition.
    return Response.json({ skipped: true });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(payload.record.id, {
    ban_duration: PERMANENT_BAN_DURATION,
  });

  if (error) {
    console.error('Failed to ban suspended user', payload.record.id, error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ banned: payload.record.id });
});
