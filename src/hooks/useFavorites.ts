import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

// "People you've roped with and want to stay in touch with" - a personal,
// one-directional saved list (favoriting someone doesn't notify them or
// imply they favorited you back). Its main use is narrowing who a Post a
// Need listing is visible to; the toggle to add/remove someone lives
// inline on partner/request cards rather than a dedicated Favorites tab.
export function useFavorites() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('favorites').select('favorite_id').eq('user_id', userId);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.favorite_id as string);
      if (ids.length === 0) return [];
      const { data: profiles, error: profileErr } = await supabase.from('public_profiles').select('*').in('id', ids);
      if (profileErr) throw profileErr;
      return profiles as PublicProfile[];
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async ({ favoriteId, isFavorite }: { favoriteId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('favorite_id', favoriteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('favorites').insert({ favorite_id: favoriteId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
