import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

// Cached auth/profile/entitlement state for fast reads across the app.
// The database itself (profiles, subscriptions tables + RLS) remains the
// source of truth - this store is a read cache, never a write path.
type SessionState = {
  session: Session | null;
  isReady: boolean;
  // NEW - distinguishes "we haven't checked yet" from "checked, and it's
  // false". hasAthleteProfile/hasProducerProfile default to false at store
  // creation, same as a genuine no-profile user - without this flag,
  // nothing downstream can tell those two situations apart during the
  // window between isReady flipping true and _layout.tsx's fire-and-forget
  // bootstrap() actually resolving. See app/(tabs)/index.tsx's guard.
  profileStatusChecked: boolean;
  hasAthleteProfile: boolean;
  hasProducerProfile: boolean;
  entitlementActive: boolean;
  setSession: (session: Session | null) => void;
  setReady: (ready: boolean) => void;
  setProfileStatusChecked: (value: boolean) => void;
  setHasAthleteProfile: (value: boolean) => void;
  setHasProducerProfile: (value: boolean) => void;
  setEntitlementActive: (value: boolean) => void;
  reset: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  isReady: false,
  profileStatusChecked: false,
  hasAthleteProfile: false,
  hasProducerProfile: false,
  entitlementActive: false,
  setSession: (session) => set({ session }),
  setReady: (isReady) => set({ isReady }),
  setProfileStatusChecked: (profileStatusChecked) => set({ profileStatusChecked }),
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
