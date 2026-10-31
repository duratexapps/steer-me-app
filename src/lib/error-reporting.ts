import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/src/lib/supabase';

// Added 2026-10-31: the app had no error reporting, so a screen that threw on someone's phone was invisible. Uncaught JS
// errors now land in the app_errors table (migration 0123) and the nightly check summarizes them. Best effort only:
// reporting must never throw, block, or slow anything down, and it stops after a few reports per session.
// It does not see native crashes that kill the app outright; those are in App Store Connect and Play Console.

let sent = 0;
const seen = new Set<string>();
const MAX_PER_SESSION = 15;

function updateInfo(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    return `update ${Updates.updateId ?? 'embedded'}${Updates.isEmbeddedLaunch ? ' (embedded bundle)' : ''}`;
  } catch {
    return 'unknown';
  }
}

export async function reportError(error: unknown, opts: { fatal?: boolean; context?: string } = {}) {
  try {
    if (sent >= MAX_PER_SESSION) return;
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 300) ?? 'unknown error');
    const message = (err.message || String(err)).slice(0, 590);
    const stack = (err.stack ?? '').slice(0, 3400);
    const fingerprint = `${err.name}:${message}`.slice(0, 115);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    sent++;
    let userId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user.id ?? null;
    } catch {
      // signed out or unreadable: report without a user
    }
    await supabase.from('app_errors').insert({
      user_id: userId,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      update_info: updateInfo().slice(0, 120),
      context: (opts.context ?? '').slice(0, 120) || null,
      fatal: !!opts.fatal,
      message,
      stack: stack || null,
      fingerprint,
    });
  } catch {
    // never let reporting cause a problem
  }
}

let installed = false;
export function installGlobalErrorReporting() {
  if (installed) return;
  installed = true;
  try {
    const g = globalThis as unknown as {
      ErrorUtils?: { getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void };
      addEventListener?: (type: string, fn: (ev: any) => void) => void;
    };
    if (g.ErrorUtils?.setGlobalHandler) {
      const previous = g.ErrorUtils.getGlobalHandler?.();
      g.ErrorUtils.setGlobalHandler((e, fatal) => {
        void reportError(e, { fatal: !!fatal, context: 'uncaught' });
        previous?.(e, fatal);
      });
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', (ev: ErrorEvent) => void reportError(ev.error ?? ev.message, { context: `web ${window.location.pathname}` }));
      window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => void reportError(ev.reason, { context: `web promise ${window.location.pathname}` }));
    }
  } catch {
    // ignore
  }
}
