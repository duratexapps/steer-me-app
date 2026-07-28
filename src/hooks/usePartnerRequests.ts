import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

export type PartnerRequestRow = {
  id: string;
  event_id: string | null;
  need_post_id: string | null;
  division: number | null;
  is_goat_roping: boolean;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'pending_guardian' | 'accepted' | 'declined';
  created_at: string;
};

// NEW, added 2026-07-28 - just enough of the linked event to drive the
// "Enter the Draw" handoff action on an accepted request (see
// my-requests.tsx) - not the full EventRow, no need for it here.
export type RequestEventInfo = { id: string; name: string; draw_pro_entry_url: string | null };

export type PartnerRequestWithProfile = PartnerRequestRow & {
  counterpart: PublicProfile | null;
  event: RequestEventInfo | null;
};

// public_profiles can't be embedded via PostgREST's FK-following syntax
// (it's a view, not the underlying table PostgREST's schema cache links
// partner_requests.recipient_id/requester_id to), so this fetches requests
// and counterpart profiles as two queries and merges them client-side.
// Event info is fetched the same way, for the same structural reason it's
// simplest to just treat every embed here as a separate query rather than
// mixing embedded and non-embedded fetches for one table.
async function withCounterparts(rows: PartnerRequestRow[], idKey: 'recipient_id' | 'requester_id') {
  const ids = [...new Set(rows.map((r) => r[idKey]))];
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((id): id is string => id !== null))];

  const [profilesResult, eventsResult] = await Promise.all([
    ids.length > 0
      ? supabase.from('public_profiles').select('*').in('id', ids)
      : Promise.resolve({ data: [] as PublicProfile[], error: null }),
    eventIds.length > 0
      ? supabase.from('events').select('id, name, draw_pro_entry_url').in('id', eventIds)
      : Promise.resolve({ data: [] as RequestEventInfo[], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const byId = new Map((profilesResult.data as PublicProfile[]).map((p) => [p.id, p]));
  const eventById = new Map((eventsResult.data as RequestEventInfo[]).map((e) => [e.id, e]));
  return rows.map((r) => ({
    ...r,
    counterpart: byId.get(r[idKey]) ?? null,
    event: r.event_id ? eventById.get(r.event_id) ?? null : null,
  }));
}

export function useSentRequests() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['sent-requests', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_requests')
        .select('*')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return withCounterparts(data as PartnerRequestRow[], 'recipient_id');
    },
  });
}

export function useReceivedRequests() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['received-requests', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_requests')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return withCounterparts(data as PartnerRequestRow[], 'requester_id');
    },
  });
}

export function useSendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipientId,
      division,
      eventId,
      needPostId,
      isGoatRoping,
    }: {
      recipientId: string;
      division: number | null;
      eventId?: string;
      needPostId?: string;
      isGoatRoping?: boolean;
    }) => {
      const { error } = await supabase.from('partner_requests').insert({
        recipient_id: recipientId,
        division,
        event_id: eventId ?? null,
        need_post_id: needPostId ?? null,
        is_goat_roping: isGoatRoping ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sent-requests'] });
    },
  });
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'accepted' | 'declined' }) => {
      const { error } = await supabase.from('partner_requests').update({ status }).eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['received-requests'] });
      queryClient.invalidateQueries({ queryKey: ['sent-requests'] });
    },
  });
}

export async function fetchRequestContact(requestId: string) {
  const { data, error } = await supabase.rpc('get_request_contact', { request_id: requestId });
  if (error) throw error;
  return data?.[0] as
    | {
        contact: string | null;
        is_guardian: boolean;
        guardian_name: string | null;
        verification_screenshot_path: string | null;
      }
    | undefined;
}
