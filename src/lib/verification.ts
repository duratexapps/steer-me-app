import { supabase } from '@/src/lib/supabase';
import type { Position } from '@/src/lib/matching';

export type VerifyCardResult = {
  verified: boolean;
  mismatches: string[];
  // Expiration is deliberately separate from `verified`/`mismatches` -
  // policy decision 2026-07-27: an expired card does not block
  // submission, it's just recorded and shown to other users (see
  // migration 0033, src/lib/matching.ts's isMembershipCurrent()).
  // isExpired is null when unknown/unreadable, distinct from false.
  expirationDate?: string | null;
  isExpired?: boolean | null;
  extracted?: Record<string, unknown>;
  skipped?: boolean;
  reason?: string;
};

type VerifyCardArgs = {
  imagePath: string;
  claimedName: string;
  claimedMembershipId: string;
  position: Position;
  claimedGlobalClassification: number | null;
  claimedHeaderClassification: number | null;
  claimedHeelerClassification: number | null;
};

/**
 * Calls the verify-classification-card Edge Function - shared by
 * sign-up.tsx and update-classification.tsx, added 2026-07-27, since both
 * screens need the identical call/error-handling shape.
 *
 * Never throws - a network failure or unexpected response is treated the
 * same as the function's own "skipped" response (AI unavailable), so the
 * caller can decide to fall back to allowing the submission with
 * needs_manual_review set, rather than the whole screen crashing over a
 * verification-infrastructure hiccup.
 */
export async function verifyClassificationCard(args: VerifyCardArgs): Promise<VerifyCardResult> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-classification-card', {
      body: args,
    });
    if (error) {
      console.error('verify-classification-card invoke error', error);
      return { verified: true, mismatches: [], skipped: true, reason: error.message };
    }
    return data as VerifyCardResult;
  } catch (err) {
    console.error('verify-classification-card unexpected failure', err);
    return { verified: true, mismatches: [], skipped: true, reason: 'Unexpected error' };
  }
}

type ReportConflictArgs = {
  membershipId: string;
  claimedName: string;
  position: Position;
  screenshotPath: string | null;
};

/**
 * Calls the report-membership-conflict Edge Function - fire-and-forget
 * from the caller's point of view. Added 2026-08-18, alongside migration
 * 0056, for the moment sign-up.tsx/update-classification.tsx's
 * profiles insert/update comes back with a 23505 unique_violation on
 * global_membership_id: logs the attempt for human review and emails
 * both the existing account holder and the blocked person, rather than
 * the conflict silently vanishing into a "contact support" toast.
 *
 * Never throws, same reasoning as verifyClassificationCard above - a
 * failure here shouldn't compound the user's existing "your submission
 * was blocked" moment with an unrelated crash.
 */
export async function reportMembershipConflict(args: ReportConflictArgs): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('report-membership-conflict', { body: args });
    if (error) {
      console.error('report-membership-conflict invoke error', error);
    }
  } catch (err) {
    console.error('report-membership-conflict unexpected failure', err);
  }
}
