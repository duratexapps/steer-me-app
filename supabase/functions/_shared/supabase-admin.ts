import { createClient } from 'npm:@supabase/supabase-js@2';

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into every
// Edge Function by Supabase. (Newer projects may also expose these as
// SUPABASE_SECRET_KEYS/SUPABASE_PUBLISHABLE_KEYS under the "secret"/
// "publishable" key rename - the legacy names below are still populated
// alongside them.) This client uses the service role and therefore bypasses
// RLS entirely - never expose it to a browser/client bundle.
export function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
