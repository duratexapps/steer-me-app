import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

// WSTR Finale flags, one row per roper per Finale year (migration 0070).
export type FinaleFlag = { classes: number[] | null; buyIn: boolean };
export type FinaleFlagsByYear = Record<number, FinaleFlag>;

function toFlag(row: { qualified_classes: number[] | null; buy_in: boolean }): FinaleFlag {
  return { classes: row.qualified_classes ? row.qualified_classes.map(Number) : null, buyIn: row.buy_in };
}

// Everyone else's current flags, keyed user -> year. Read through the
// public_finale_flags view, which already hides ended years, suspended or
// hidden profiles and blocked pairs.
export async function fetchPublicFinaleFlags(): Promise<Record<string, FinaleFlagsByYear>> {
  const { data, error } = await supabase.from('public_finale_flags').select('*');
  if (error) throw error;
  const out: Record<string, FinaleFlagsByYear> = {};
  for (const r of data ?? []) {
    (out[r.user_id] ??= {})[r.finale_year] = toFlag(r);
  }
  return out;
}

export function useMyFinaleFlags() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-finale-flags', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FinaleFlagsByYear> => {
      const { data, error } = await supabase.from('finale_flags').select('*').eq('user_id', userId);
      if (error) throw error;
      const out: FinaleFlagsByYear = {};
      for (const r of data ?? []) out[r.finale_year] = toFlag(r);
      return out;
    },
  });
}

// Saves one year's flags. Both fields empty deletes the row.
export function useSaveFinaleFlags() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async ({ year, flag }: { year: number; flag: FinaleFlag }) => {
      const empty = !flag.classes?.length && !flag.buyIn;
      const q = empty
        ? supabase.from('finale_flags').delete().eq('user_id', userId).eq('finale_year', year)
        : supabase.from('finale_flags').upsert({
            user_id: userId,
            finale_year: year,
            qualified_classes: flag.classes?.length ? flag.classes : null,
            buy_in: flag.buyIn,
            updated_at: new Date().toISOString(),
          });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-finale-flags', userId] });
      queryClient.invalidateQueries({ queryKey: ['eligible-partners'] });
    },
  });
}
