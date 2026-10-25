import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type LayoverKind = 'fairgrounds' | 'equestrian_center' | 'boarding_barn' | 'arena' | 'campground' | 'hotel';

export type MyLayoverListing = {
  id: string;
  name: string;
  kind: LayoverKind;
  city: string;
  state: string;
  address: string | null;
  review_status: 'pending' | 'approved' | 'rejected';
  featured_until: string | null;
};

// The signed-in owner's own layover spot and hotel listings (RLS shows an owner their own, including pending).
export function useMyLayoverListings() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['layover-listings', 'mine', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('layover_spots')
        .select('id,name,kind,city,state,address,review_status,featured_until')
        .eq('owner_id', userId)
        .order('name');
      if (error) throw error;
      return data as MyLayoverListing[];
    },
  });
}

export type NewLayoverListing = {
  name: string;
  kind: LayoverKind;
  city: string;
  state: string;
  address: string;
  phone: string;
  website: string;
  has_stalls: boolean;
  has_pens: boolean;
  housing_detail: string;
  rv_hookups: boolean;
  rv_detail: string;
  notes: string;
};

// Saves a pending listing through submit_layover_listing (migration 0109) and returns its id.
export function useSubmitLayoverListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (l: NewLayoverListing): Promise<string> => {
      const { data, error } = await supabase.rpc('submit_layover_listing', {
        p_name: l.name,
        p_kind: l.kind,
        p_city: l.city,
        p_state: l.state,
        p_address: l.address,
        p_phone: l.phone,
        p_website: l.website,
        p_has_stalls: l.has_stalls,
        p_has_pens: l.has_pens,
        p_housing_detail: l.housing_detail,
        p_rv_hookups: l.rv_hookups,
        p_rv_detail: l.rv_detail,
        p_notes: l.notes,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layover-listings'] });
    },
  });
}
