import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { canPair, type Classification, type Position } from '@/src/lib/matching';

export type PublicProfile = {
  id: string;
  full_name: string;
  position: Position;
  home_area: string;
  global_classification: number | null;
  header_classification: number | null;
  heeler_classification: number | null;
  avatar_url: string | null;
  is_minor: boolean;
  // NEW, added 2026-07-27 alongside migration 0033 - see
  // src/lib/matching.ts's isMembershipCurrent() for how this gets turned
  // into a "not current" badge. null means never successfully read, NOT
  // the same as expired.
  membership_expiration_date: string | null;
};

// Structural type instead of PublicProfile specifically, so MyProfile
// (which has the same four relevant fields but isn't PublicProfile) can
// be passed too, without an explicit cast at every call site.
type ClassificationSource = {
  position: Position;
  global_classification: number | null;
  header_classification: number | null;
  heeler_classification: number | null;
};

export function toClassification(p: ClassificationSource): Classification {
  return {
    position: p.position,
    globalClassification: p.global_classification,
    headerClassification: p.header_classification,
    heelerClassification: p.heeler_classification,
  };
}

// A single representative number for sort-order display purposes only -
// NOT used for any eligibility math, which always goes through canPair()
// with the correct end-specific number instead. Switch Enders show the
// average of their two numbers here since there's no one "the" number to
// sort by; Header/Heeler-only just use their one real number.
function displayNumber(p: PublicProfile): number {
  if (p.position === 'Switch') {
    if (p.header_classification != null && p.heeler_classification != null) {
      return (p.header_classification + p.heeler_classification) / 2;
    }
    return p.header_classification ?? p.heeler_classification ?? 0;
  }
  return p.global_classification ?? 0;
}

export function useEligiblePartners(cap: number, nearCity: string | null) {
  const { data: me } = useMyProfile();

  return useQuery({
    queryKey: ['eligible-partners', me?.id, cap, nearCity],
    enabled: !!me,
    queryFn: async () => {
      // Real fix 2026-07-25 (see migration 0030 / src/lib/matching.ts):
      // this used to do the whole eligibility check as one SQL filter
      // (.lte('global_classification', maxAllowed)), which only ever
      // worked because every profile had exactly one number in one
      // column. A Switch Ender's EFFECTIVE number now depends on which
      // end they'd play against each specific candidate (and a
      // Switch-vs-Switch pairing has two possible valid assignments), so
      // there's no single column value to filter on in one query anymore.
      // Fetch the broader candidate pool (still excluding my own
      // exclusive position at the DB level, since that part of the old
      // logic is still correct - a fixed Header can never pair with
      // another fixed Header regardless of numbers) and apply the real,
      // number-aware canPair() check client-side.
      const meClassification = toClassification(me!);

      let query = supabase.from('public_profiles').select('*').neq('id', me!.id);
      if (me!.position !== 'Switch') {
        query = query.neq('position', me!.position);
      }

      const { data, error } = await query;
      if (error) throw error;
      const candidates = (data ?? []) as PublicProfile[];

      const partners = candidates
        .filter((c) => canPair(meClassification, toClassification(c), cap))
        .sort((a, b) => displayNumber(b) - displayNumber(a));

      // Mirrors the prototype: surface exact-city matches first when
      // browsing by current location, rather than a real distance sort
      // (home_area is free text, not coordinates).
      if (nearCity) {
        return [...partners].sort(
          (a, b) => Number(b.home_area === nearCity) - Number(a.home_area === nearCity)
        );
      }
      return partners;
    },
  });
}
