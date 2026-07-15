import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

// Eligibility itself (attended before the event date, event has passed,
// within the 30-day window, one per athlete per event) is fully enforced
// by the enforce_rating_eligibility() trigger - this just tracks which
// events the caller has already rated, so the UI can hide "Rate this
// event" rather than let a submit fail on the trigger's error.
export function useMyRatedEventIds() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-rated-events', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('event_ratings').select('event_id').eq('athlete_id', userId);
      if (error) throw error;
      return new Set((data as { event_id: string }[]).map((r) => r.event_id));
    },
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, stars, review }: { eventId: string; stars: number; review: string }) => {
      const { error } = await supabase.from('event_ratings').insert({ event_id: eventId, stars, review: review || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-rated-events'] });
      queryClient.invalidateQueries({ queryKey: ['event-rating-summaries'] });
    },
  });
}
