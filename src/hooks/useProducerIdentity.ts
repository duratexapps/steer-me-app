import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type ProducerIdentityMatch = {
  id: string;
  org_name: string;
  is_sanctioning_body: boolean;
  claimed_by: string | null;
  event_count: number;
  avg_stars: number | null;
  rating_count: number;
};

// Backs the sign-up "is this you?" step - searches unclaimed identities by
// a case-insensitive org_name match so a producer with pre-existing
// flier-posted history (see migration 0061's backfill) can find and claim
// it instead of starting a fresh, empty-reputation identity. Sanctioning
// bodies (WSTR/USTRC/etc.) are excluded - those were never a real
// producer's own identity to begin with.
export function useProducerIdentityMatches(orgNameQuery: string) {
  const trimmed = orgNameQuery.trim();
  return useQuery({
    queryKey: ['producer-identity-matches', trimmed],
    enabled: trimmed.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_identity_directory')
        .select('*')
        .ilike('org_name', `%${trimmed}%`)
        .eq('is_sanctioning_body', false)
        .is('claimed_by', null)
        .order('event_count', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as ProducerIdentityMatch[];
    },
  });
}

export function useMyProducerIdentity() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-producer-identity', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_identity_directory')
        .select('*')
        .eq('claimed_by', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as ProducerIdentityMatch | null;
    },
  });
}
