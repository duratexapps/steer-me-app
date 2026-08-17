import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';

// Backs app/my-entries.tsx - the "check draw position and results without
// leaving the app" feature. See migrations 0042_draw_pro_entry_links.sql /
// 0043_draw_pro_round_results.sql / 0045_draw_pro_multi_team_entries.sql /
// 0048_draw_pro_per_entry_tracking.sql and supabase/RUNBOOK.md's "Draw Pro
// results hand-off" section for the full pipeline this reads the output
// of. RLS already scopes every table here to auth.uid() = steer_me_user_id
// (directly or via a join), so plain selects are safe as-is - no
// .eq('steer_me_user_id', ...) needed client-side, same convention as
// every other RLS-scoped query in this app.
//
// REWRITTEN 2026-08-06 - real gap flagged directly by the producer's own
// live testing: this used to group everything by EVENT (one card per
// event, one Cancel button for "something at this event"), which broke
// down the moment a person entered the same event more than once across
// separate sessions - there was no way to tell, let alone cancel, one
// specific entry. draw_pro_entry_link_teams (previously "one row per team
// a person lands on") now also represents a PENDING entry BEFORE the draw
// runs (team_number null until then - see migration 0048's own comment on
// why that table, not a new one) - so this now returns one entry PER ROW,
// flat, not grouped by event at all. Each entry carries its own event
// info, its own team assignment (or lack of one yet), and its own
// cancellation state.

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

// NEW, added 2026-08-05 - see migration 0046_draw_pro_extra_run_charges.sql.
// A team can carry at most one charge (unique on entry_link_team_id) - an
// "extra run" the Draw Pro producer knowingly assigned beyond what this
// person already paid for, needing a real pay/decline choice.
export type DrawProExtraRunCharge = {
  id: string;
  fee_amount: number;
  status: 'pending' | 'paid' | 'declined';
};

export type DrawProEntry = {
  id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  role: 'header' | 'heeler' | null;
  // NEW, added 2026-08-06 - which kind of entry this was at submission
  // time. 'draw_in' means requested_run_count solo runs, no one else
  // involved - 'preformed_team' means this specific pairing with
  // partner_name below.
  entry_type: 'draw_in' | 'preformed_team';
  requested_run_count: number;
  submitted_at: string;
  team_number: number | null;
  // NEW, added 2026-08-09 for migration 0049_team_number_of_total.sql -
  // real gap flagged directly by the user: a bare team number doesn't
  // say how big the field is. Null for entries pushed before this field
  // existed, or for any entry whose team-assignment push simply predates
  // the migration - my-entries.tsx falls back to showing team_number
  // alone in that case, not a broken "of null".
  total_teams: number | null;
  partner_name: string | null;
  partner_classification_number: number | null;
  partner_role: 'header' | 'heeler' | null;
  results: DrawProRoundResult[];
  extraRunCharge: DrawProExtraRunCharge | null;
  // NEW, added 2026-08-06 - see migration
  // 0048_draw_pro_per_entry_tracking.sql. Null unless THIS entry
  // specifically had cancellation requested - still shows up in this
  // list until the producer actually processes it on Draw Pro's side
  // (which deletes just this one row), so "requested" is a distinct,
  // visible state rather than the entry just vanishing.
  cancellation_requested_at: string | null;
};

export function useMyDrawProEntries() {
  return useQuery({
    queryKey: ['draw-pro-entries', 'mine'],
    queryFn: async (): Promise<DrawProEntry[]> => {
      const { data: links, error: linksError } = await supabase
        .from('draw_pro_entry_links')
        .select('id, event_id, role');
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      const linkById = new Map(links.map((l) => [l.id, l]));
      const eventIds = [...new Set(links.map((l) => l.event_id))];
      const linkIds = links.map((l) => l.id);

      // Three queries + merge, not a PostgREST embed - same reasoning as
      // withProducerNames() in useEvents.ts: keeps this working
      // regardless of whether events/draw_pro_entry_link_teams ever become
      // views (which can't be embedded via FK-following syntax).
      const [{ data: events, error: eventsError }, { data: entries, error: entriesError }] = await Promise.all([
        supabase.from('events').select('id, name, event_date').in('id', eventIds),
        supabase
          .from('draw_pro_entry_link_teams')
          .select(
            'id, entry_link_id, team_number, total_teams, partner_name, partner_classification_number, partner_role, entry_type, requested_run_count, submitted_at, cancellation_requested_at'
          )
          .in('entry_link_id', linkIds)
          .order('submitted_at', { ascending: false }),
      ]);
      if (eventsError) throw eventsError;
      if (entriesError) throw entriesError;

      const entryIds = (entries ?? []).map((e) => e.id);
      const [{ data: results, error: resultsError }, { data: charges, error: chargesError }] =
        entryIds.length > 0
          ? await Promise.all([
              supabase
                .from('draw_pro_round_results')
                .select(
                  'id, entry_link_team_id, round, no_time, raw_time, broken_barrier, one_leg_catch, penalty_seconds, final_time'
                )
                .in('entry_link_team_id', entryIds)
                .order('round', { ascending: true }),
              // NEW, added 2026-08-05 - see migration
              // 0046_draw_pro_extra_run_charges.sql. Independent of the
              // round-results query above, so fetched together rather than
              // sequentially.
              supabase
                .from('draw_pro_extra_run_charges')
                .select('id, entry_link_team_id, fee_amount, status')
                .in('entry_link_team_id', entryIds),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
            ];
      if (resultsError) throw resultsError;
      if (chargesError) throw chargesError;

      const eventsById = new Map((events ?? []).map((e) => [e.id, e]));
      const resultsByEntry = new Map<string, DrawProRoundResult[]>();
      for (const r of results ?? []) {
        const list = resultsByEntry.get(r.entry_link_team_id) ?? [];
        list.push(r);
        resultsByEntry.set(r.entry_link_team_id, list);
      }
      const chargeByEntry = new Map<string, DrawProExtraRunCharge>();
      for (const c of charges ?? []) {
        chargeByEntry.set(c.entry_link_team_id, { id: c.id, fee_amount: c.fee_amount, status: c.status });
      }

      return (entries ?? []).map((e) => {
        const link = linkById.get(e.entry_link_id);
        const event = link ? eventsById.get(link.event_id) : undefined;
        return {
          id: e.id,
          event_id: link?.event_id ?? '',
          event_name: event?.name ?? 'Unknown event',
          event_date: event?.event_date ?? '',
          role: (link?.role ?? null) as 'header' | 'heeler' | null,
          entry_type: e.entry_type as 'draw_in' | 'preformed_team',
          requested_run_count: e.requested_run_count,
          submitted_at: e.submitted_at,
          team_number: e.team_number,
          total_teams: e.total_teams,
          partner_name: e.partner_name,
          partner_classification_number: e.partner_classification_number,
          partner_role: e.partner_role as 'header' | 'heeler' | null,
          results: resultsByEntry.get(e.id) ?? [],
          extraRunCharge: chargeByEntry.get(e.id) ?? null,
          cancellation_requested_at: e.cancellation_requested_at,
        };
      });
    },
  });
}

// NEW, added 2026-08-05 - the entrant's one-time pay/decline choice for an
// extra-run charge (see migration 0046_draw_pro_extra_run_charges.sql).
// Goes through the choose_extra_run_payment() RPC rather than a direct
// table update - RLS deliberately gives authenticated users no direct
// write policy on draw_pro_extra_run_charges (see that migration's own
// comment), so the RPC is the only path, and it re-validates ownership +
// pending status server-side regardless of what the client sends.
export function useChooseExtraRunPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chargeId, decision }: { chargeId: string; decision: 'paid' | 'declined' }) => {
      const { data, error } = await supabase.rpc('choose_extra_run_payment', {
        p_charge_id: chargeId,
        p_decision: decision,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draw-pro-entries', 'mine'] });
    },
  });
}

// REWRITTEN 2026-08-06 for migration 0048_draw_pro_per_entry_tracking.sql -
// now targets ONE specific entry (entryId, a draw_pro_entry_link_teams
// row), not the whole per-event link - real gap fixed: the old version
// could only ever mean "cancel something at this event," with no way to
// say which of several separate entries. The RPC itself re-verifies no
// team has been assigned yet (rejects otherwise) and handles the
// partner-cascade/notify logic server-side. This only ever marks the
// request; the entry keeps showing (in a "requested" state) until the
// producer actually processes it on Draw Pro's side.
export function useRequestEntryCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId }: { entryId: string }) => {
      const { error } = await supabase.rpc('request_draw_pro_entry_submission_cancellation', {
        p_entry_id: entryId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draw-pro-entries', 'mine'] });
    },
  });
}
