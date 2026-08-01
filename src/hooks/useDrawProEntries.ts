import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';

// Backs app/my-entries.tsx - the "check draw position and results without
// leaving the app" feature. See migrations 0042_draw_pro_entry_links.sql /
// 0043_draw_pro_round_results.sql and supabase/RUNBOOK.md's "Draw Pro
// results hand-off" section for the full pipeline this reads the output
// of. RLS already scopes both tables to auth.uid() = steer_me_user_id (via
// a join for round_results), so a plain select here is safe as-is - no
// .eq('steer_me_user_id', ...) needed client-side, same convention as
// every other RLS-scoped query in this app.

export type DrawProRoundResult = {
  id: string;
  round: number;
  no_time: boolean;
  raw_time: number | null;
  broken_barrier: boolean;
  one_leg_catch: boolean;
  penalty_seconds: number;
  final_time: number | null;
};

export type DrawProEntry = {
  id: string;
  event_id: string;
  role: 'header' | 'heeler' | null;
  team_number: number | null;
  event_name: string;
  event_date: string;
  results: DrawProRoundResult[];
};

export function useMyDrawProEntries() {
  return useQuery({
    queryKey: ['draw-pro-entries', 'mine'],
    queryFn: async (): Promise<DrawProEntry[]> => {
      const { data: links, error: linksError } = await supabase
        .from('draw_pro_entry_links')
        .select('id, event_id, role, team_number')
        .order('created_at', { ascending: false });
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      // Two queries + merge, not a PostgREST embed - same reasoning as
      // withProducerNames() in useEvents.ts: keeps this working
      // regardless of whether events/draw_pro_round_results ever become
      // views (which can't be embedded via FK-following syntax).
      const eventIds = links.map((l) => l.event_id);
      const linkIds = links.map((l) => l.id);

      const [{ data: events, error: eventsError }, { data: results, error: resultsError }] = await Promise.all([
        supabase.from('events').select('id, name, event_date').in('id', eventIds),
        supabase
          .from('draw_pro_round_results')
          .select('id, entry_link_id, round, no_time, raw_time, broken_barrier, one_leg_catch, penalty_seconds, final_time')
          .in('entry_link_id', linkIds)
          .order('round', { ascending: true }),
      ]);
      if (eventsError) throw eventsError;
      if (resultsError) throw resultsError;

      const eventsById = new Map((events ?? []).map((e) => [e.id, e]));
      const resultsByLink = new Map<string, DrawProRoundResult[]>();
      for (const r of results ?? []) {
        const list = resultsByLink.get(r.entry_link_id) ?? [];
        list.push(r);
        resultsByLink.set(r.entry_link_id, list);
      }

      return links.map((link) => {
        const event = eventsById.get(link.event_id);
        return {
          id: link.id,
          event_id: link.event_id,
          role: link.role,
          team_number: link.team_number,
          event_name: event?.name ?? 'Unknown event',
          event_date: event?.event_date ?? '',
          results: resultsByLink.get(link.id) ?? [],
        };
      });
    },
  });
}
