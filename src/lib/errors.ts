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
    return (
      "That Global Membership ID is already registered to another Steer Me account. " +
      "If this is your own ID and you believe someone else is using your identity, " +
      "contact support so we can investigate."
    );
  }
  return error.message;
}
