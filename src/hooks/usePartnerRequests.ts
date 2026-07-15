import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

export type PartnerRequestRow = {
  id: string;
  event_id: string | null;
  division: number;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'pending_guardian' | 'accepted' | 'declined';
  created_at: string;
};

export type PartnerRequestWithProfile = PartnerRequestRow & { counterpart: PublicProfile | null };

// public_profiles can't be embedded via PostgREST's FK-following syntax
// (it's a view, not the underlying table PostgREST's schema cache links
// partner_requests.recipient_id/requester_id to), so this fetches requests
// and counterpart profiles as two queries and merges them client-side.
async function withCounterparts(rows: PartnerRequestRow[], idKey: 'recipient_id' | 'requester_id') {
  const ids = [...new Set(rows.map((r) => r[idKey]))];
  if (ids.length === 0) return [] as PartnerRequestWithProfile[];

  const { data, error } = await supabase.from('public_profiles').select('*').in('id', ids);
  if (error) throw error;
  const byId = new Map((data as PublicProfile[]).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, counterpart: byId.get(r[idKey]) ?? null }));
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
    }: {
      recipientId: string;
      division: number;
      eventId?: string;
    }) => {
      const { error } = await supabase
        .from('partner_requests')
        .insert({ recipient_id: recipientId, division, event_id: eventId ?? null });
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
  return data?.[0] as { contact: string | null; is_guardian: boolean; guardian_name: string | null } | undefined;
}
