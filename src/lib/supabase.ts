import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
// Regenerate with `supabase gen types typescript --local > src/lib/database.types.ts`
// once the Phase 1 migrations land, then swap this back to createClient<Database>(...).

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// FIXED live 2026-07-30 - real build-breaking bug surfaced by enabling
// `web.output: "static"` (see app/index.tsx's own big comment for why -
// real SEO gap, needed a genuinely static/crawlable landing page).
// AsyncStorage's web implementation delegates straight to
// `window.localStorage` - fine in an actual browser, but this module is
// imported by nearly every screen, and static export prerenders every
// route in a Node process where `window` doesn't exist at all. Supabase's
// client tries to read the configured storage immediately on
// construction (to recover any existing session), which threw
// `ReferenceError: window is not defined` and broke the ENTIRE static
// export, not just the new landing page. This no-ops instead of touching
// `window` at all when it's genuinely absent (Node prerendering); once
// actually running in a real browser (or on native), behavior is
// unchanged from before - AsyncStorage/localStorage still backs real
// session persistence exactly as it did.
const webSafeStorage = {
  getItem: (key: string) => (typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) =>
    typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) => (typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webSafeStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
