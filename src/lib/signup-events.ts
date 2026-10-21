import { supabase } from '@/src/lib/supabase';

// Tiny funnel log (migration 0094): which sign-up step a roper reached and what they answered, so the size of
// the group without a Global card is measured. Best effort: never blocks or breaks sign-up.
export async function logSignupEvent(step: string, value?: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('signup_events').insert({ user_id: user.id, step, value: value ?? null });
  } catch {
    // ignore
  }
}
