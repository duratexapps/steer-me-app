import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { showToast } from '@/src/state/toast-store';

export const USER_REPORT_OFFENSES = [
  'Foul or abusive language',
  'Sexually explicit or suggestive content',
  'Soliciting a minor',
  'Harassment or bullying',
  'Fake profile or classification',
  'Other',
];

export const EVENT_REPORT_OFFENSES = [
  'Event misrepresented (date, location, payout)',
  "Event didn't happen as advertised",
  'Unsafe conditions at event',
  'Non-payment of winnings',
  'Other',
];

export function useSubmitUserReport() {
  return useMutation({
    mutationFn: async (params: {
      targetUserId: string;
      offense: string;
      description: string;
      contentRef: string;
    }) => {
      const { error } = await supabase.from('user_reports').insert({
        target_user_id: params.targetUserId,
        offense: params.offense,
        description: params.description,
        content_ref: params.contentRef,
      });
      if (error) throw error;
    },
    onSuccess: () => showToast('Report submitted - our team will review it'),
  });
}

export function useSubmitEventReport() {
  return useMutation({
    mutationFn: async (params: { eventId: string; offense: string; description: string }) => {
      const { error } = await supabase.from('event_reports').insert({
        event_id: params.eventId,
        offense: params.offense,
        description: params.description,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      showToast("Event flagged for review - separate from, and doesn't change, its star rating"),
  });
}
