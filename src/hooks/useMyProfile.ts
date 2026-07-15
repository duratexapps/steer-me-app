import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type MyProfile = {
  id: string;
  full_name: string;
  is_minor: boolean;
  guardian_name: string | null;
  position: 'Header' | 'Heeler';
  home_area: string;
  contact: string | null;
  avatar_url: string | null;
  global_membership_id: string | null;
  global_classification: number | null;
  verification_screenshot_path: string | null;
  suspended: boolean;
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
