import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

// Shared by the confirm-email and reset-password screens (rewritten 2026-10-31). Supabase redirects back to the app with
// either tokens or an error in the URL fragment (after the #). Three things used to go wrong on those screens:
//  1. the app was already open, so Linking.getInitialURL() (the URL the app was LAUNCHED with) never saw the link;
//  2. a used or expired link comes back as #error=..., which was reported as "missing required information";
//  3. any exception while setting the session left the screen on its spinner forever.
// This reads the latest incoming URL (including one that arrives while the app is running) and tells tokens from errors.

export type AuthLink = {
  tokens: { access_token: string; refresh_token: string } | null;
  errorCode: string | null;
  errorDescription: string | null;
};

export function parseAuthLink(url: string | null | undefined): AuthLink {
  const empty: AuthLink = { tokens: null, errorCode: null, errorDescription: null };
  if (!url) return empty;
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const queryStart = url.indexOf('?');
  const query = queryStart === -1 ? '' : url.slice(queryStart + 1, hashIndex === -1 ? undefined : hashIndex);
  const a = new URLSearchParams(fragment);
  const b = new URLSearchParams(query);
  const get = (k: string) => a.get(k) ?? b.get(k);
  const access_token = get('access_token');
  const refresh_token = get('refresh_token');
  return {
    tokens: access_token && refresh_token ? { access_token, refresh_token } : null,
    errorCode: get('error_code') ?? get('error'),
    errorDescription: get('error_description'),
  };
}

// The most recent URL that opened or re-opened the app. Web reads the address bar (Linking drops the fragment there).
export function useIncomingAuthUrl(): string | null {
  const linkingUrl = Linking.useLinkingURL();
  const [initial, setInitial] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Linking.getInitialURL()
      .then(setInitial)
      .catch(() => {});
  }, []);
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.location.href : null;
  return linkingUrl ?? initial;
}
