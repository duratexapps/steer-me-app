import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

// Roping alert settings (migration 0128). A member with no row yet sees the defaults; the first save creates the row.
export type AlertPrefs = {
  weekly: boolean;
  instant: boolean; // instant alerts: paying members only, enforced by the sender
  radius_miles: number | null; // null = any distance
  include_jackpots: boolean;
  include_clinics: boolean;
  include_practices: boolean;
  class_min: number | null;
  class_max: number | null;
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  weekly: true,
  instant: false,
  radius_miles: 250,
  include_jackpots: true,
  include_clinics: true,
  include_practices: true,
  class_min: null,
  class_max: null,
};

export function useAlertPrefs() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['alert-prefs', userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ prefs: AlertPrefs; saved: boolean }> => {
      const { data, error } = await supabase
        .from('alert_prefs')
        .select('weekly, instant, radius_miles, include_jackpots, include_clinics, include_practices, class_min, class_max')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { prefs: DEFAULT_ALERT_PREFS, saved: false };
      return {
        saved: true,
        prefs: {
          weekly: data.weekly,
          instant: data.instant,
          radius_miles: data.radius_miles,
          include_jackpots: data.include_jackpots,
          include_clinics: data.include_clinics,
          include_practices: data.include_practices,
          class_min: data.class_min == null ? null : Number(data.class_min),
          class_max: data.class_max == null ? null : Number(data.class_max),
        },
      };
    },
  });
}

export function useSaveAlertPrefs() {
  const userId = useSessionStore((s) => s.session?.user.id);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: AlertPrefs) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase.from('alert_prefs').upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-prefs', userId] }),
  });
}
