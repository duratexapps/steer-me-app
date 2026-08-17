import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

// Goat roping isn't bound by the classification-cap system, so there's no
// eligibility math here at all - just "who else has registered interest,"
// same shape as event_attendance but without an event/division to scope it
// to. goat_roping_interest rows only ever get joined through
// public_profiles for display, which already filters blocked/suspended
// users out.
export function useGoatRopingInterest() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['goat-roping-interest', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: interest, error: interestError } = await supabase
        .from('goat_roping_interest')
        .select('athlete_id')
        .neq('athlete_id', userId);
      if (interestError) throw interestError;

      const ids = (interest as { athlete_id: string }[]).map((r) => r.athlete_id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase.from('public_profiles').select('*').in('id', ids);
      if (error) throw error;
      return data as PublicProfile[];
    },
  });
}

export function useMyGoatRopingInterest() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-goat-roping-interest', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goat_roping_interest')
        .select('athlete_id')
        .eq('athlete_id', userId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useRegisterGoatRopingInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('goat_roping_interest').upsert({});
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goat-roping-interest'] });
      queryClient.invalidateQueries({ queryKey: ['my-goat-roping-interest'] });
    },
  });
}
