import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { Position } from '@/src/lib/matching';

export type MyProfile = {
  id: string;
  full_name: string;
  is_minor: boolean;
  guardian_name: string | null;
  guardian_contact: string | null;
  position: Position;
  home_area: string;
  contact: string | null;
  avatar_url: string | null;
  global_membership_id: string | null;
  global_classification: number | null;
  // Switch Ender only - see migration 0030. Both null until they've
  // completed dual-number verification; Header/Heeler-only ropers never
  // populate these, they use global_classification instead.
  header_classification: number | null;
  heeler_classification: number | null;
  verification_screenshot_path: string | null;
  suspended: boolean;
  // NEW, added 2026-07-27 alongside migration 0032/0033.
  needs_manual_review: boolean;
  membership_expiration_date: string | null;
  // NEW, added 2026-07-27 alongside migration 0034 (referrals).
  referral_code: string | null;
  referred_by: string | null;
  referral_reward_granted_at: string | null;
};

export function useMyProfile() {
  const userId = useSessionStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: ['my-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data as MyProfile;
    },
  });
}

export function useInvalidateMyProfile() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return () => queryClient.invalidateQueries({ queryKey: ['my-profile', userId] });
}
