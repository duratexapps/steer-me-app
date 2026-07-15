import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import { showToast } from '@/src/state/toast-store';

export type BlockedProfile = {
  id: string;
  full_name: string;
  position: 'Header' | 'Heeler';
  home_area: string;
  global_classification: number | null;
  avatar_url: string | null;
};

export function useBlockedProfiles() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['blocked-profiles', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_blocked_profiles');
      if (error) throw error;
      return data as BlockedProfile[];
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.from('blocks').insert({ blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      showToast("Blocked - they can't contact you or appear in your matches");
      queryClient.invalidateQueries({ queryKey: ['blocked-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-partners'] });
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase.from('blocks').delete().eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      showToast('Unblocked');
      queryClient.invalidateQueries({ queryKey: ['blocked-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-partners'] });
    },
  });
}
