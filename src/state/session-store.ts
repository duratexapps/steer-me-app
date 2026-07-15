import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

// Cached auth/profile/entitlement state for fast reads across the app.
// The database itself (profiles, subscriptions tables + RLS) remains the
// source of truth - this store is a read cache, never a write path.
type SessionState = {
  session: Session | null;
  isReady: boolean;
  hasAthleteProfile: boolean;
  hasProducerProfile: boolean;
  entitlementActive: boolean;
  setSession: (session: Session | null) => void;
  setReady: (ready: boolean) => void;
  setHasAthleteProfile: (value: boolean) => void;
  setHasProducerProfile: (value: boolean) => void;
  setEntitlementActive: (value: boolean) => void;
  reset: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  isReady: false,
  hasAthleteProfile: false,
  hasProducerProfile: false,
  entitlementActive: false,
  setSession: (session) => set({ session }),
  setReady: (isReady) => set({ isReady }),
  setHasAthleteProfile: (hasAthleteProfile) => set({ hasAthleteProfile }),
  setHasProducerProfile: (hasProducerProfile) => set({ hasProducerProfile }),
  setEntitlementActive: (entitlementActive) => set({ entitlementActive }),
  reset: () =>
    set({
      session: null,
      hasAthleteProfile: false,
      hasProducerProfile: false,
      entitlementActive: false,
    }),
}));
