import { Platform } from 'react-native';
import { supabase } from '@/src/lib/supabase';

// Anonymous usage counts for the members-only travel tools (hauling paperwork checker, layover finder), to tell
// us whether a tool earns a bigger build. Website only: the store privacy labels say the apps collect no usage
// data, so inside the native apps this does nothing. The random visitor id lives in the browser, is not an account
// id, and the server does not record who is signed in (log_feature_event stores user_id as null).

export type TravelFeature = 'travel_checker' | 'layover_finder';

let memoryVisitorId: string | null = null;
function visitorId(): string {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    let id = ls?.getItem('travel_visitor');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      ls?.setItem('travel_visitor', id);
    }
    return id;
  } catch {
    memoryVisitorId ??= Math.random().toString(36).slice(2) + Date.now().toString(36);
    return memoryVisitorId;
  }
}

export function logFeature(feature: TravelFeature, event: string, props: Record<string, unknown> = {}) {
  if (Platform.OS !== 'web') return;
  supabase.rpc('log_feature_event', { p_feature: feature, p_event: event, p_props: props, p_visitor: visitorId() }).then(() => {}, () => {});
}
