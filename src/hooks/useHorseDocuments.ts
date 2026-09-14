import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSessionStore } from '@/src/state/session-store';

export type HorseDocument = {
  id: string;
  owner_id: string;
  horse_name: string;
  description: string | null;
  document_path: string;
  test_date: string | null;
  created_at: string;
};

export function useMyHorseDocuments() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my-horse-documents', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horse_documents')
        .select('*')
        .eq('owner_id', userId!)
        .order('horse_name', { ascending: true });
      if (error) throw error;
      return data as HorseDocument[];
    },
  });
}

function useInvalidateHorseDocuments() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  return () => queryClient.invalidateQueries({ queryKey: ['my-horse-documents', userId] });
}

export function useAddHorseDocument() {
  const invalidate = useInvalidateHorseDocuments();
  const userId = useSessionStore((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async (input: { horseName: string; description: string | null; documentPath: string; testDate: string | null }) => {
      const { error } = await supabase.from('horse_documents').insert({
        owner_id: userId,
        horse_name: input.horseName,
        description: input.description,
        document_path: input.documentPath,
        test_date: input.testDate,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteHorseDocument() {
  const invalidate = useInvalidateHorseDocuments();
  return useMutation({
    mutationFn: async (input: { id: string; documentPath: string }) => {
      // Storage cleanup best-effort, same "delete the row regardless" order
      // as removeUserFile's other call sites - a failed storage delete
      // shouldn't leave an orphaned row a roper can't get rid of.
      await supabase.storage.from('coggins-documents').remove([input.documentPath]);
      const { error } = await supabase.from('horse_documents').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// Creates a brand-new, ~30-minute share token every call - never reused,
// per the design decision to regenerate on every "Show at the gate" tap
// rather than let one QR code work indefinitely. expires_at in the
// response is server-forced (see coggins_shares_force_expiry trigger),
// not something this ever needs to compute itself.
export function useCreateCogginsShare() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('coggins_shares')
        .insert({ owner_id: userId })
        .select('token, expires_at')
        .single();
      if (error) throw error;
      return data as { token: string; expires_at: string };
    },
  });
}
