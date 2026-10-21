import { useCallback } from 'react';
import { useMyProfile } from '@/src/hooks/useMyProfile';
import { isMembershipCurrent } from '@/src/lib/matching';
import { useGlobalCardPrompt } from '@/src/state/global-card-prompt-store';

// WSTR and USTRC ropings require a current membership, and every WSTR / USTRC / Key Card membership includes a
// Global Handicap card (checked on wstroping.com/memberships and ustrc.com/join, 2026-10-22). A roper with no card
// on file (self-reported number) or an expired one is asked to upload their card, or pointed to where to get one,
// before they can join those events here. The page below sells WSTR, USTRC and Key Card memberships in one place.
export const MEMBERSHIPS_URL = 'https://wstroping.com/memberships';
// For a roper who only needs a standalone Global Handicap card (new = Register, returning = Reregistered).
export const GLOBAL_REGISTER_URL = 'https://www.globalhandicaps.com/Register';

// Event tags set by the flier scan / producers (events.tags): 'wstr', 'ustrc'.
export function isSanctionedEvent(tags: string[] | null | undefined): boolean {
  return !!tags?.some((t) => t === 'wstr' || t === 'ustrc');
}

export type CardProblem = 'missing' | 'expired' | null;

export function cardProblemFor(
  profile: { number_source: 'verified' | 'self_reported'; membership_expiration_date: string | null } | null | undefined
): CardProblem {
  if (!profile) return null;
  if (profile.number_source !== 'verified') return 'missing';
  return isMembershipCurrent(profile.membership_expiration_date) === false ? 'expired' : null;
}

// Returns a function: call it with an event's tags before a sanctioned-event action. True = go ahead.
// False = the "Global card needed" prompt was shown and the action should stop.
export function useRequireGlobalCardForEvent() {
  const { data: me } = useMyProfile();
  const open = useGlobalCardPrompt((s) => s.open);
  return useCallback(
    (tags: string[] | null | undefined): boolean => {
      if (!isSanctionedEvent(tags)) return true;
      const problem = cardProblemFor(me);
      if (!problem) return true;
      open(problem);
      return false;
    },
    [me, open]
  );
}
