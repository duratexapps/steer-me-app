import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';
import type { Position } from '@/src/lib/matching';
import type { PublicProfile } from '@/src/hooks/useEligiblePartners';

export type EventRow = {
  id: string;
  // Nullable: a Draw-Pro-synced event has no Steer Me producer account
  // behind it at all (Draw Pro producers authenticate via Wix Members, not
  // Supabase Auth) - draw_pro_event_id identifies it instead. See migration
  // 0029_draw_pro_event_sync.sql.
  producer_id: string | null;
  name: string;
  // Start date - see event_end_date below. Kept as the sort/comparison
  // anchor everywhere it already was (migration 0039) - only display
  // logic and "is this still upcoming" checks need to know about the
  // end date at all.
  event_date: string;
  // NEW, added 2026-07-29 alongside migration 0039 - null for a
  // single-day event. When set, the event runs event_date through
  // event_end_date inclusive. Use formatDateRangeDisplay() to show
  // both correctly, and isEventUpcoming()/isEventOngoingOrUpcoming
  // rather than comparing event_date alone against today.
  event_end_date: string | null;
  location: string;
  entry_fee: string | null;
  description: string | null;
  // NEW, added 2026-07-30 alongside migration 0041 - real ask: cost,
  // caps, max entries etc vary PER DIVISION on a real flier, and mixing
  // all of that into the single shared `description` above disconnected
  // it from the specific division a reader actually cares about. Keyed
  // by division number AS A STRING (JSON object keys are always strings -
  // e.g. divisionDetails?.['9.5']), each value a short free-text blob for
  // that one division only. Absent/null for a division falls back to the
  // event's shared entry_fee - most events still just have one fee for
  // everything and don't need this at all. See EventCard.tsx for where
  // this actually renders (alongside that division's own checkbox, not
  // above the division list with everything else).
  division_details: Record<string, string> | null;
  divisions: number[];
  flier_path: string | null;
  status: 'pending_review' | 'published' | 'removed';
  draw_pro_event_id: string | null;
  draw_pro_entry_url: string | null;
  external_producer_name: string | null;
  // NEW, added 2026-07-29 alongside migration 0038 - true for a TEMPORARY
  // cold-start bootstrap event: a trusted admin entered this on a real
  // producer's behalf (from a flier), before that producer has any
  // account here at all. See useCreateAdminEvent() for the full reasoning.
  posted_by_admin: boolean;
};

export type EventWithProducer = EventRow & { producer_org_name: string | null };

// NEW, added 2026-07-30 alongside migration 0041 - shared by
// create-event.tsx, admin-post-event.tsx, and admin-edit-event.tsx.
// DivisionDetailsFields.tsx collects one free-text box per division
// regardless of whether the producer/admin actually typed anything into
// it - this trims that down to just the divisions that are both
// currently selected AND actually have real text, so toggling a
// division off (or never touching its box) never leaves stale/empty
// keys sitting in the stored JSON. Returns null (not {}) when nothing
// qualifies, matching division_details' own "nothing here, fall back to
// the shared entry_fee" convention.
export function buildDivisionDetailsPayload(
  divisions: number[],
  details: Record<string, string>
): Record<string, string> | null {
  const entries = divisions
    .map((d) => [String(d), details[String(d)]?.trim()] as const)
    .filter((entry): entry is [string, string] => !!entry[1]);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

type PublicProducerProfile = { id: string; org_name: string; verification_status: string };

// Same reasoning as partner_requests + public_profiles: public_producer_profiles
// is a view, so it can't be embedded via PostgREST's FK-following syntax -
// fetch events and producer names as two queries and merge client-side.
async function withProducerNames(events: EventRow[]): Promise<EventWithProducer[]> {
  const ids = [...new Set(events.map((e) => e.producer_id).filter((id): id is string => id !== null))];
  const byId = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from('public_producer_profiles').select('*').in('id', ids);
    if (error) throw error;
    for (const p of data as PublicProducerProfile[]) byId.set(p.id, p.org_name);
  }
  // Draw-Pro-synced events have no real producer_profiles row to join
  // against - external_producer_name (set by the sync call) covers that
  // case instead, so the UI still has something sensible to show.
  return events.map((e) => ({
    ...e,
    producer_org_name: (e.producer_id ? byId.get(e.producer_id) : undefined) ?? e.external_producer_name ?? null,
  }));
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
      // NEW, added 2026-07-29 - optional, omit/null for a single-day event.
      event_end_date?: string | null;
      location: string;
      entry_fee: string;
      divisions: number[];
      description: string;
      flier_path: string | null;
      // NEW, added 2026-07-30 alongside migration 0041 - optional,
      // omit/null when every division shares the same fee/details.
      division_details?: Record<string, string> | null;
    }) => {
      const { error } = await supabase.from('events').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// NEW, added 2026-07-29 alongside migration 0038 - a TEMPORARY cold-start
// bootstrap feature (see that migration's own comment for the full
// reasoning: gated to is_admin accounts, lets a trusted admin post a real
// event on a producer's behalf, from a flier, before that producer has
// any account here at all). Reuses external_producer_name - the exact
// same field Draw-Pro-synced events already use for "a real producer
// name with no real linked account behind it" - rather than inventing a
// second mechanism for the same underlying situation. status is set to
// 'published' directly (not left to auto_publish_event()'s trigger,
// which only ever checks a real producer_profiles row and would leave
// this at the default 'pending_review' forever, since producer_id is
// null here) - an admin posting this is already the trust/review step.
export function useCreateAdminEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      event_date: string;
      event_end_date?: string | null;
      location: string;
      entry_fee: string;
      divisions: number[];
      description: string;
      flier_path: string | null;
      external_producer_name: string;
      admin_poster_id: string;
      division_details?: Record<string, string> | null;
    }) => {
      const { error } = await supabase.from('events').insert({
        ...input,
        // FIXED live 2026-07-29: producer_id has a column DEFAULT of
        // auth.uid() (migration 0018 - a convenience so a normal
        // producer's own useCreateEvent() call never has to pass it
        // explicitly). Confirmed live: omitting it here silently
        // auto-filled the ADMIN's own id instead, which isn't a real
        // producer_profiles row, and the insert failed on the
        // events_producer_id_fkey foreign key. Must be explicitly
        // nulled out to override that default for this admin path.
        producer_id: null,
        posted_by_admin: true,
        status: 'published',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// NEW, added 2026-07-29 - backs admin-edit-event.tsx. Real gap flagged
// directly by the user: nobody, not even an admin, had any way to fix a
// typo or attach a flier to an event that already exists - Create only
// ever inserted, nothing ever updated. Single-event fetch (not filtered
// to published-only like usePublishedEvents) so an admin can still find
// and fix an event even if its status somehow isn't 'published'.
export function useEventById(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'by-id', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (error) throw error;
      return data as EventRow;
    },
  });
}

// NEW, added 2026-07-29 - the update half of useCreateAdminEvent(),
// scoped by direct instruction to ADMIN-POSTED events only, not every
// event on the platform: "Admin-posted events only... matches the
// existing database permission boundary already in place." Mirrors
// migration 0038's events_update_admin RLS policy exactly (posted_by_admin
// = true, caller is_admin = true) - the .eq('posted_by_admin', true) here
// is defense in depth, not the real enforcement; RLS is. Deliberately
// never touches producer_id/posted_by_admin/admin_poster_id themselves -
// only the real content fields a flier correction would ever need to
// change.
export function useUpdateAdminEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventId,
      ...input
    }: {
      eventId: string;
      name: string;
      event_date: string;
      event_end_date?: string | null;
      location: string;
      entry_fee: string;
      divisions: number[];
      description: string;
      flier_path: string | null;
      external_producer_name: string;
      division_details?: Record<string, string> | null;
    }) => {
      const { error } = await supabase.from('events').update(input).eq('id', eventId).eq('posted_by_admin', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// Backs the "search for your event" step in create-need-post.tsx - lets an
// athlete link their posted need to a real, already-listed event instead
// of retyping its details, so multiple athletes posting for the SAME event
// end up genuinely consolidated (queryable by shared event_id) rather than
// each creating a disconnected copy.
export function useSearchPublishedEvents(query: string) {
  return useQuery({
    queryKey: ['events', 'search', query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .ilike('name', `%${query.trim()}%`)
        .order('event_date', { ascending: true })
        .limit(10);
      if (error) throw error;
      return withProducerNames(data as EventRow[]);
    },
  });
}

// Shown alongside a matched event during that same search step - lets the
// poster see "N others already posted for this event" before deciding to
// add their own.
export function useNeedPostCountForEvent(eventId: string | null) {
  return useQuery({
    queryKey: ['need-posts', 'count-for-event', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('need_posts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);
      if (error) throw error;
      return count ?? 0;
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

export function useEventPartners(eventId: string, division: number, myPosition: Position) {
  return useQuery({
    queryKey: ['event-partners', eventId, division, myPosition],
    queryFn: async () => {
      const { data: attendance, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('athlete_id')
        .eq('event_id', eventId)
        .eq('division', division);
      if (attendanceError) throw attendanceError;

      const athleteIds = (attendance as { athlete_id: string }[]).map((a) => a.athlete_id);
      if (athleteIds.length === 0) return [];

      // Same canPair() reasoning as useEligiblePartners: exclude only my
      // own exclusive position server-side; a Switch Ender sees everyone
      // attending, regardless of their position.
      let query = supabase.from('public_profiles').select('*').in('id', athleteIds);
      if (myPosition !== 'Switch') {
        query = query.neq('position', myPosition);
      }

      const { data, error } = await query;
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
