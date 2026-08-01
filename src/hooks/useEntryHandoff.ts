import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';

// Backs the Draw Pro entry-prefill handoff (see migration
// 0036_entry_handoffs.sql for the full reasoning). Returns the new
// entry_handoffs row's id - the caller appends it to the event's
// draw_pro_entry_url as `&handoff=<id>` before opening it.
export function useCreateEntryHandoff() {
  return useMutation({
    mutationFn: async (args: {
      eventId: string;
      partnerRequestId?: string;
      meRole?: 'header' | 'heeler';
      partnerRole?: 'header' | 'heeler';
    }) => {
      const { data, error } = await supabase.rpc('create_entry_handoff', {
        p_event_id: args.eventId,
        p_partner_request_id: args.partnerRequestId ?? null,
        p_me_role: args.meRole ?? null,
        p_partner_role: args.partnerRole ?? null,
      });
      if (error) throw error;
      return data as string;
    },
  });
}

// Appends the handoff id to a draw_pro_entry_url the same way on both
// call sites (EventCard's solo case, my-requests.tsx's confirmed-partner
// case) - centralized so the query param name/format can't drift between
// them.
export function withHandoffParam(entryUrl: string, handoffId: string): string {
  const separator = entryUrl.includes('?') ? '&' : '?';
  return `${entryUrl}${separator}handoff=${handoffId}`;
}

// NEW, added 2026-07-31 alongside migration 0042_draw_pro_entry_links.sql -
// the durable counterpart to the handoff above. handoff=<id> is a
// short-lived, single-use prefill snapshot; steerRef=<token> is a
// long-lived link Draw Pro stores on the entrant record and later uses to
// push a team number (and, once built, round results) back to this
// specific user. Deliberately a second, independent param rather than
// reusing the handoff id itself - the handoff row gets consumed/expires
// within the hour, which is the wrong lifetime for something that needs
// to still resolve weeks later when a producer finalizes a draw.
export function useCreateDrawProEntryLink() {
  return useMutation({
    mutationFn: async (args: { eventId: string; role?: 'header' | 'heeler' }) => {
      const { data, error } = await supabase.rpc('create_draw_pro_entry_link', {
        p_event_id: args.eventId,
        p_role: args.role ?? null,
      });
      if (error) throw error;
      return data as string;
    },
  });
}

export function withEntryLinkParam(entryUrl: string, token: string): string {
  const separator = entryUrl.includes('?') ? '&' : '?';
  return `${entryUrl}${separator}steerRef=${token}`;
}
