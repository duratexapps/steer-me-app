import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

export type EventRow = {
  id: string;
  producer_id: string;
  name: string;
  event_date: string;
  location: string;
  entry_fee: string | null;
  description: string | null;
  divisions: number[];
  status: 'pending_review' | 'published' | 'removed';
};

export type EventWithProducer = EventRow & { producer_org_name: string | null };

type PublicProducerProfile = { id: string; org_name: string; verification_status: string };

// Same reasoning as partner_requests + public_profiles: public_producer_profiles
// is a view, so it can't be embedded via PostgREST's FK-following syntax -
// fetch events and producer names as two queries and merge client-side.
async function withProducerNames(events: EventRow[]): Promise<EventWithProducer[]> {
  const ids = [...new Set(events.map((e) => e.producer_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('public_producer_profiles').select('*').in('id', ids);
  if (error) throw error;
  const byId = new Map((data as PublicProducerProfile[]).map((p) => [p.id, p.org_name]));
  return events.map((e) => ({ ...e, producer_org_name: byId.get(e.producer_id) ?? null }));
}

export function usePublishedEvents() {
  return useQuery({
    queryKey: ['events', 'published'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('event_date', { ascending: true });
      if (error) throw error;
      return withProducerNames(data as EventRow[]);
    },
  });
}

export function useMyEvents() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['events', 'mine', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('producer_id', userId)
        .order('event_date', { ascending: true });
      if (error) throw error;
      return data as EventRow[];
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      event_date: string;
      location: string;
      entry_fee: string;
      divisions: number[];
      description: string;
    }) => {
      const { error } = await supabase.from('events').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// event_id:division -> athlete_id[] for every division of every event passed
// in, so a screen can compute per-division attendee counts in one query.
export function useAttendanceCounts(eventIds: string[]) {
  return useQuery({
    queryKey: ['event-attendance-counts', eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('event_id, division')
        .in('event_id', eventIds);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data as { event_id: string; division: number }[]) {
        const key = `${row.event_id}:${row.division}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    },
  });
}

export function useMyAttendance(eventIds: string[], myId: string | undefined) {
  return useQuery({
    queryKey: ['my-attendance', eventIds, myId],
    enabled: eventIds.length > 0 && !!myId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('event_id, division')
        .eq('athlete_id', myId)
        .in('event_id', eventIds);
      if (error) throw error;
      return new Set((data as { event_id: string; division: number }[]).map((r) => `${r.event_id}:${r.division}`));
    },
  });
}

export function useToggleAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      division,
      attending,
    }: {
      eventId: string;
      division: number;
      attending: boolean;
    }) => {
      if (attending) {
        const { error } = await supabase.from('event_attendance').delete().eq('event_id', eventId).eq('division', division);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('event_attendance').insert({ event_id: eventId, division });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['event-attendance-counts'] });
    },
  });
}

export function useEventPartners(eventId: string, division: number, oppositePosition: 'Header' | 'Heeler') {
  return useQuery({
    queryKey: ['event-partners', eventId, division, oppositePosition],
    queryFn: async () => {
      const { data: attendance, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('athlete_id')
        .eq('event_id', eventId)
        .eq('division', division);
      if (attendanceError) throw attendanceError;

      const athleteIds = (attendance as { athlete_id: string }[]).map((a) => a.athlete_id);
      if (athleteIds.length === 0) return [];

      const { data, error } = await supabase
        .from('public_profiles')
        .select('*')
        .in('id', athleteIds)
        .eq('position', oppositePosition);
      if (error) throw error;
      return data as PublicProfile[];
    },
  });
}

export type RatingSummary = { event_id: string; avg_stars: number | null; rating_count: number };

export function useRatingSummaries(eventIds: string[]) {
  return useQuery({
    queryKey: ['event-rating-summaries', eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('event_rating_summary').select('*').in('event_id', eventIds);
      if (error) throw error;
      return new Map((data as RatingSummary[]).map((r) => [r.event_id, r]));
    },
  });
}
