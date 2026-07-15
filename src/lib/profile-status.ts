import { supabase } from '@/src/lib/supabase';

// Cheap existence checks used to decide routing (does this signed-in user
// already have an athlete profile / producer profile row?).
export async function checkProfileStatus(userId: string) {
  const [athlete, producer] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
    supabase.from('producer_profiles').select('id').eq('id', userId).maybeSingle(),
  ]);

  return {
    hasAthleteProfile: !!athlete.data,
    hasProducerProfile: !!producer.data,
  };
}
