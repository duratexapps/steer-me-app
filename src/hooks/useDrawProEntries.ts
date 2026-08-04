import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';

// Backs app/my-entries.tsx - the "check draw position and results without
// leaving the app" feature. See migrations 0042_draw_pro_entry_links.sql /
// 0043_draw_pro_round_results.sql / 0045_draw_pro_multi_team_entries.sql
// and supabase/RUNBOOK.md's "Draw Pro results hand-off" section for the
// full pipeline this reads the output of. RLS already scopes every table
// here to auth.uid() = steer_me_user_id (directly or via a join), so plain
// selects are safe as-is - no .eq('steer_me_user_id', ...) needed
// client-side, same convention as every other RLS-scoped query in this app.
//
// REWRITTEN 2026-08-04 - a Steer Me user can land on more than one team
// for the same event (a solo Draw Pro entrant with multiple draw-in
// slots), so this now returns one entry PER TEAM, not one per event link -
// each carries its own partner and its own round results.

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

export type DrawProTeam = {
  id: string;
  team_number: number;
  partner_name: string | null;
  partner_classification_number: number | null;
  partner_role: 'header' | 'heeler' | null;
  results: DrawProRoundResult[];
};

export type DrawProEntry = {
  id: string;
  event_id: string;
  role: 'header' | 'heeler' | null;
  event_name: string;
  event_date: string;
  teams: DrawProTeam[];
};

export function useMyDrawProEntries() {
  return useQuery({
    queryKey: ['draw-pro-entries', 'mine'],
    queryFn: async (): Promise<DrawProEntry[]> => {
      const { data: links, error: linksError } = await supabase
        .from('draw_pro_entry_links')
        .select('id, event_id, role')
        .order('created_at', { ascending: false });
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      // Three queries + merge, not a PostgREST embed - same reasoning as
      // withProducerNames() in useEvents.ts: keeps this working
      // regardless of whether events/draw_pro_entry_link_teams ever become
      // views (which can't be embedded via FK-following syntax).
      const eventIds = links.map((l) => l.event_id);
      const linkIds = links.map((l) => l.id);

      const [{ data: events, error: eventsError }, { data: teams, error: teamsError }] = await Promise.all([
        supabase.from('events').select('id, name, event_date').in('id', eventIds),
        supabase
          .from('draw_pro_entry_link_teams')
          .select('id, entry_link_id, team_number, partner_name, partner_classification_number, partner_role')
          .in('entry_link_id', linkIds)
          .order('team_number', { ascending: true }),
      ]);
      if (eventsError) throw eventsError;
      if (teamsError) throw teamsError;

      const teamIds = (teams ?? []).map((t) => t.id);
      const { data: results, error: resultsError } =
        teamIds.length > 0
          ? await supabase
              .from('draw_pro_round_results')
              .select(
                'id, entry_link_team_id, round, no_time, raw_time, broken_barrier, one_leg_catch, penalty_seconds, final_time'
              )
              .in('entry_link_team_id', teamIds)
              .order('round', { ascending: true })
          : { data: [], error: null };
      if (resultsError) throw resultsError;

      const eventsById = new Map((events ?? []).map((e) => [e.id, e]));
      const resultsByTeam = new Map<string, DrawProRoundResult[]>();
      for (const r of results ?? []) {
        const list = resultsByTeam.get(r.entry_link_team_id) ?? [];
        list.push(r);
        resultsByTeam.set(r.entry_link_team_id, list);
      }
      const teamsByLink = new Map<string, DrawProTeam[]>();
      for (const t of teams ?? []) {
        const list = teamsByLink.get(t.entry_link_id) ?? [];
        list.push({
          id: t.id,
          team_number: t.team_number,
          partner_name: t.partner_name,
          partner_classification_number: t.partner_classification_number,
          partner_role: t.partner_role,
          results: resultsByTeam.get(t.id) ?? [],
        });
        teamsByLink.set(t.entry_link_id, list);
      }

      return links.map((link) => {
        const event = eventsById.get(link.event_id);
        return {
          id: link.id,
          event_id: link.event_id,
          role: link.role,
          event_name: event?.name ?? 'Unknown event',
          event_date: event?.event_date ?? '',
          teams: teamsByLink.get(link.id) ?? [],
        };
      });
    },
  });
}
