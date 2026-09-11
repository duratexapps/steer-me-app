import type { PostgrestError } from '@supabase/supabase-js';

// NEW, added 2026-07-27, alongside migration 0031's unique constraint on
// global_membership_id. Postgres' unique_violation SQLSTATE is always
// '23505' regardless of which constraint tripped it - Supabase's
// PostgrestError surfaces this as error.code. Without this, a real
// membership-ID conflict would have shown the user a raw
// "duplicate key value violates unique constraint
// profiles_global_membership_id_unique" message, which is both confusing
// and doesn't tell them what to actually do about it.
//
// Kept generic (not hardcoded to only the membership-ID case) since any
// future unique constraint added to this table would otherwise hit the
// same raw-error problem - but the specific, actionable copy below is
// written for the membership-ID case specifically, since that's the
// only unique constraint that exists on profiles today.
export function friendlySupabaseError(error: PostgrestError): string {
  if (error.code === '23505') {
    // NEW, updated 2026-08-18 alongside migration 0056 and
    // report-membership-conflict - this conflict is no longer a dead
    // end the blocked person has to think to escalate themselves. The
    // caller (sign-up.tsx/update-classification.tsx) also fires
    // reportMembershipConflict() right when this error comes back, which
    // logs the attempt for review and emails both the existing account
    // holder and the blocked person - this copy reflects that it already
    // happened, not that the user needs to go do it.
    return (
      "That Global Membership ID is already registered to another Steer Me account. " +
      "We've flagged this for review and let the existing account holder know. " +
      "If this is genuinely your own ID, contact support with a photo of your card and we'll help sort it out."
    );
  }
  return error.message;
}
