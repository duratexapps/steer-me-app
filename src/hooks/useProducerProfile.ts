import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type ProducerProfile = {
  id: string;
  org_name: string;
  contact_name: string | null;
  contact_info: string | null;
  affiliation: string | null;
  verification_doc_path: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
};

export function useMyProducerProfile() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-producer-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('producer_profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data as ProducerProfile | null;
    },
  });
}

export function useInvalidateProducerProfile() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return () => queryClient.invalidateQueries({ queryKey: ['my-producer-profile', userId] });
}
