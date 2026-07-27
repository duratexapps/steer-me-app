// NEW, added 2026-07-27 - closes a real gap the user flagged directly:
// nothing previously checked that an uploaded "verification screenshot"
// was even a real Global Handicap card, let alone that its name/ID/
// classification/expiration actually matched what the user typed in.
// Migration 0031 (unique membership ID) stops two accounts from sharing
// one identity indefinitely; this function is the other half - catching
// a bad submission at the moment it happens, before an account is ever
// created/updated with mismatched information.
//
// Design choice, deliberate: the AI model's ONLY job is EXTRACTION (read
// the card, return what it says, as plain structured JSON) - it does NOT
// decide match/mismatch itself. All comparison logic below is our own
// deterministic code. This keeps the actual fraud-detection rules
// auditable and testable, instead of trusting a model's end-to-end judgment
// call on something this consequential.
//
// Called directly by the client (sign-up.tsx / update-classification.tsx)
// via supabase.functions.invoke(), which attaches the calling user's own
// auth JWT automatically - verified below so this can't be hit
// anonymously (it costs real money per call, via the Anthropic API).
//
// Card layout this was built against (real sample provided by the user):
// a name, "ID#: <number>", "Class: <header>/<heeler>" (BOTH numbers shown
// even for a Header- or Heeler-only roper, not just Switch Enders - see
// this function's own note on CLASSIFICATION COMPARISON below), a
// location, and "Membership Expires <M/D/YYYY>" - no separate active/
// expired badge; currency is purely that date compared to today.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // fast/cheap is fine for structured extraction, not nuanced judgment

type VerifyRequest = {
  imagePath: string; // path within the verification-screenshots bucket
  claimedName: string;
  claimedMembershipId: string;
  position: 'Header' | 'Heeler' | 'Switch';
  // Only the field(s) relevant to `position` need to be non-null - mirrors
  // the same header/heeler split already used elsewhere in this app
  // (src/lib/matching.ts's Classification type).
  claimedGlobalClassification: number | null; // Header/Heeler-only
  claimedHeaderClassification: number | null; // Switch only
  claimedHeelerClassification: number | null; // Switch only
};

type ExtractedCard = {
  name: string | null;
  membershipId: string | null;
  headerClassification: number | null; // first number in "Class: X/Y"
  heelerClassification: number | null; // second number in "Class: X/Y"
  expirationDate: string | null; // ISO yyyy-mm-dd if the model could parse it
};

Deno.serve(async (req) => {
  // Verify this is a real signed-in Steer Me user, not an anonymous
  // caller - this endpoint calls a paid external API per request.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (!body.imagePath || !body.claimedName || !body.claimedMembershipId || !body.position) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Same "don't punish users for our own infrastructure" principle as
    // the network-error fallback below - if this isn't configured yet at
    // all, don't block every sign-up, just say so plainly so the caller
    // can flag the profile for manual review instead.
    return Response.json({ skipped: true, reason: 'AI verification not configured yet' });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: imageData, error: downloadError } = await supabaseAdmin.storage
    .from('verification-screenshots')
    .download(body.imagePath);
  if (downloadError || !imageData) {
    console.error('Could not download verification screenshot', body.imagePath, downloadError);
    return Response.json({ skipped: true, reason: 'Could not load uploaded image' });
  }

  const imageBytes = new Uint8Array(await imageData.arrayBuffer());
  const base64Image = btoa(String.fromCharCode(...imageBytes));
  const mediaType = imageData.type || 'image/jpeg';

  let extracted: ExtractedCard;
  try {
    extracted = await extractCardFields(apiKey, base64Image, mediaType);
  } catch (err) {
    // AI service down/erroring/returned unparseable output - same
    // fallback principle: don't block a real sign-up over our own AI
    // provider having a bad moment. Flag for manual review instead.
    console.error('Card extraction failed', err);
    return Response.json({ skipped: true, reason: 'AI verification temporarily unavailable' });
  }

  const mismatches = compareClaimedToExtracted(body, extracted);

  return Response.json({
    verified: mismatches.length === 0,
    mismatches,
    extracted, // returned for the client to show specifics, and for support to review later if disputed
  });
});

async function extractCardFields(apiKey: string, base64Image: string, mediaType: string): Promise<ExtractedCard> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
            {
              type: 'text',
              text:
                'This is a photo/screenshot of a Global Handicap team roping membership card. ' +
                'Read exactly what is printed on it and respond with ONLY a JSON object (no other ' +
                'text, no markdown fences) in this exact shape:\n' +
                '{"name": string or null, "membershipId": string or null, ' +
                '"headerClassification": number or null, "heelerClassification": number or null, ' +
                '"expirationDate": "YYYY-MM-DD" or null}\n' +
                'The card shows a classification as "Class: X/Y" - X is headerClassification, Y is ' +
                'heelerClassification, in that order, even if X and Y are the same number. ' +
                'The card shows an expiration as "Membership Expires M/D/YYYY" - convert that to ' +
                'YYYY-MM-DD. If you cannot confidently read a field, or the image does not appear to ' +
                'be a Global Handicap card at all, return null for that field rather than guessing.',
            },
          ],
        },
      ],
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${responseBody}`);
  }

  const data = JSON.parse(responseBody);
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('No text content in Anthropic response');

  // Defensive - the prompt asks for JSON only, but strip markdown fences
  // if the model wraps it in one anyway, rather than failing outright.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

/**
 * All match/mismatch decisions live here, deliberately deterministic and
 * separate from the AI call above - see this file's header comment.
 */
function compareClaimedToExtracted(claimed: VerifyRequest, extracted: ExtractedCard): string[] {
  const mismatches: string[] = [];

  if (!extracted.name || !extracted.membershipId) {
    mismatches.push(
      "This doesn't look like a readable Global Handicap card - make sure the name and ID# are clearly visible."
    );
    return mismatches; // no point checking the rest if we couldn't even read the basics
  }

  if (!namesRoughlyMatch(claimed.claimedName, extracted.name)) {
    mismatches.push(`The name on the card ("${extracted.name}") doesn't match the name you entered ("${claimed.claimedName}").`);
  }

  if (normalizeId(claimed.claimedMembershipId) !== normalizeId(extracted.membershipId)) {
    mismatches.push(`The ID# on the card (${extracted.membershipId}) doesn't match the ID you entered (${claimed.claimedMembershipId}).`);
  }

  // Positional check, matching the card's own "Class: header/heeler"
  // order - a Header-only roper is checked against the FIRST number, a
  // Heeler-only roper against the SECOND, a Switch Ender against BOTH.
  // Real nuance discovered from an actual card sample: Global's card
  // shows BOTH numbers for every member, not just Switch Enders - a
  // Header-only roper's card still has a heeler-side number on it, which
  // this deliberately does NOT check, since Steer Me's own data model
  // only tracks the one number relevant to that person's stated position.
  if (claimed.position === 'Header' || claimed.position === 'Switch') {
    const claimedHeader = claimed.position === 'Header' ? claimed.claimedGlobalClassification : claimed.claimedHeaderClassification;
    if (!numbersRoughlyMatch(claimedHeader, extracted.headerClassification)) {
      mismatches.push(`The header classification on the card (${extracted.headerClassification ?? 'unreadable'}) doesn't match what you entered (${claimedHeader ?? 'nothing'}).`);
    }
  }
  if (claimed.position === 'Heeler' || claimed.position === 'Switch') {
    const claimedHeeler = claimed.position === 'Heeler' ? claimed.claimedGlobalClassification : claimed.claimedHeelerClassification;
    if (!numbersRoughlyMatch(claimedHeeler, extracted.heelerClassification)) {
      mismatches.push(`The heeler classification on the card (${extracted.heelerClassification ?? 'unreadable'}) doesn't match what you entered (${claimedHeeler ?? 'nothing'}).`);
    }
  }

  if (extracted.expirationDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (extracted.expirationDate < today) {
      mismatches.push(`This card expired on ${extracted.expirationDate} - it's no longer current. Upload a current membership card.`);
    }
  }

  return mismatches;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Token-overlap heuristic rather than exact string equality - "Justin
// Modlin" vs "Justin R. Modlin" or minor case/spacing differences are
// formatting, not fraud. Requires every token OCR'd from the card to
// appear somewhere in the claimed name (or vice versa), so a genuinely
// DIFFERENT name (no shared tokens at all) still fails clearly.
function namesRoughlyMatch(claimed: string, extracted: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const claimedTokens = new Set(normalize(claimed));
  const extractedTokens = new Set(normalize(extracted));
  if (claimedTokens.size === 0 || extractedTokens.size === 0) return false;

  const smaller = claimedTokens.size <= extractedTokens.size ? claimedTokens : extractedTokens;
  const larger = claimedTokens.size <= extractedTokens.size ? extractedTokens : claimedTokens;
  let overlap = 0;
  for (const token of smaller) if (larger.has(token)) overlap += 1;
  return overlap >= smaller.size; // every token in the smaller name must appear in the larger one
}

// Small tolerance (0.01) for floating-point noise, not for genuinely
// different classifications - 4.5 vs 4.5 must match, 4.5 vs 5.0 must not.
function numbersRoughlyMatch(claimed: number | null, extracted: number | null): boolean {
  if (claimed == null || extracted == null) return false;
  return Math.abs(claimed - extracted) < 0.01;
}
