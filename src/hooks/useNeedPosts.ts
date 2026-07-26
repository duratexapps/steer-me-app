import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import { useMyProfile, type MyProfile } from '@/src/hooks/useMyProfile';
import { canPair } from '@/src/lib/matching';
import { toClassification, type PublicProfile } from '@/src/hooks/useEligiblePartners';

export type NeedPostVisibility = 'everyone' | 'favorites' | 'selected';

export type NeedPostRow = {
  id: string;
  athlete_id: string;
  event_id: string | null;
  is_goat_roping: boolean;
  division: number | null;
  event_date: string;
  event_name: string;
  producer_name: string;
  location: string | null;
  flier_path: string | null;
  facebook_link: string | null;
  visibility: NeedPostVisibility;
  created_at: string;
};

export type NeedPostWithPoster = NeedPostRow & { poster: PublicProfile | null };

async function withPosters(rows: NeedPostRow[]): Promise<NeedPostWithPoster[]> {
  const ids = [...new Set(rows.map((r) => r.athlete_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('public_profiles').select('*').in('id', ids);
  if (error) throw error;
  const byId = new Map((data as PublicProfile[]).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, poster: byId.get(r.athlete_id) ?? null }));
}

// A viewer is eligible to respond to a posted need if canPair() finds a
// valid header/heeler assignment between the two of them under the
// poster's cap - same real, number-aware check as useEligiblePartners(),
// just evaluated against the poster's numbers instead of a browsed list.
// Goat roping posts have no cap or position constraint at all.
function isEligibleForPost(post: NeedPostRow, poster: PublicProfile, me: MyProfile) {
  if (post.is_goat_roping) return true;
  if (post.division == null) return false;
  return canPair(toClassification(poster), toClassification(me), post.division);
}

export function useOpenNeedPosts() {
  const { data: me } = useMyProfile();
  return useQuery({
    queryKey: ['need-posts', 'open', me?.id],
    enabled: !!me,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('need_posts')
        .select('*')
        .neq('athlete_id', me!.id)
        .or(`is_goat_roping.eq.true,event_date.gte.${today}`)
        .order('event_date', { ascending: true });
      if (error) throw error;

      const withPostersData = await withPosters(data as NeedPostRow[]);
      return withPostersData.filter((p) => p.poster && isEligibleForPost(p, p.poster, me!));
    },
  });
}

export function useMyNeedPosts() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['need-posts', 'mine', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('need_posts')
        .select('*')
        .eq('athlete_id', userId)
        .order('event_date', { ascending: true });
      if (error) throw error;
      return data as NeedPostRow[];
    },
  });
}

export function useCreateNeedPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      is_goat_roping: boolean;
      division: number | null;
      event_id: string | null;
      event_date: string;
      event_name: string;
      producer_name: string;
      location: string | null;
      flier_path: string | null;
      facebook_link: string | null;
      visibility: NeedPostVisibility;
      selected_favorite_ids: string[];
    }) => {
      const { selected_favorite_ids, ...postFields } = input;
      const { data, error } = await supabase.from('need_posts').insert(postFields).select('id').single();
      if (error) throw error;

      // Only meaningful for visibility='selected' - the RLS policy on
      // need_posts checks this table to decide who else can see the row,
      // so it needs to be populated before anyone but the poster can view it.
      if (postFields.visibility === 'selected' && selected_favorite_ids.length > 0) {
        const rows = selected_favorite_ids.map((athlete_id) => ({ need_post_id: data.id, athlete_id }));
        const { error: visError } = await supabase.from('need_post_visible_to').insert(rows);
        if (visError) throw visError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['need-posts'] });
    },
  });
}

export function useDeleteNeedPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('need_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['need-posts'] });
    },
  });
}
