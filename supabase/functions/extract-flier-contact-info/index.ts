// NEW, added 2026-08-09 - real gap flagged directly by the user: an
// admin-posted event (RopingTools uploading a flier for a producer not
// yet on Draw Pro) had no "Enter the Draw" button AND no way for an
// entrant to find out how to actually enter - see EventCard.tsx's
// noDrawProNote. The flier image itself almost always already has the
// answer printed on it (a contact name + phone number, an email, etc.) -
// this reads that off the image so an admin doesn't have to squint at a
// flier and retype it by hand.
//
// Same design choice as verify-classification-card: the AI model's ONLY
// job is EXTRACTION, returned as plain JSON, and the admin reviews/edits
// the result in the form before saving - never auto-published unreviewed
// (same "AI drafts, a human confirms" pattern already established for
// scanned entrant cards on the Draw Pro side, and for this exact
// verify-classification-card flow). Called directly by admin-post-event.tsx
// / admin-edit-event.tsx via supabase.functions.invoke(), which attaches
// the calling user's own auth JWT - verified below so this can't be hit
// anonymously (it costs real money per call, via the Anthropic API).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { buildExtractionSystemPrompt } from '../_shared/ai-safety-prompt.ts';

// NEW, added 2026-08-18 - see _shared/ai-safety-prompt.ts's own header
// comment for the full reasoning (standing, permanent policy - resist
// prompt injection embedded in an upload, stay strictly on-topic).
const SYSTEM_PROMPT = buildExtractionSystemPrompt(
  'read a photo/scan of a team roping event flier and extract only how a contestant enters or who to contact.',
  'a short plain-text line combining the entry/contact method actually printed on a real team roping flier - a name, phone number, email, or entry website'
);

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // fast/cheap is fine for structured extraction, not nuanced judgment

type ExtractRequest = {
  flierPath: string; // path within the event-fliers bucket
};

type ExtractedContact = {
  contactInfo: string | null;
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

  // Abuse ceiling, not a real usage cap - see _shared/rate-limit.ts. This
  // is currently only wired into the admin bootstrap-posting UI (see this
  // file's header comment), so 15/day is generous for even a busy day of
  // posting/re-uploading fliers.
  const allowed = await checkRateLimit(`user:${callerData.user.id}`, 'extract_flier_contact_info', 15, 1440);
  if (!allowed) {
    return Response.json({ error: 'Too many requests - try again later.' }, { status: 429 });
  }

  let body: ExtractRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (!body.flierPath) {
    return Response.json({ error: 'Missing flierPath' }, { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Same "don't punish the admin for our own infrastructure" principle
    // as the network-error fallback below - if this isn't configured,
    // don't block posting the event, just say so plainly so the admin
    // can type the contact info in manually instead.
    return Response.json({ skipped: true, reason: 'AI extraction not configured yet' });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: imageData, error: downloadError } = await supabaseAdmin.storage
    .from('event-fliers')
    .download(body.flierPath);
  if (downloadError || !imageData) {
    console.error('Could not download flier image', body.flierPath, downloadError);
    return Response.json({ skipped: true, reason: 'Could not load uploaded flier' });
  }

  const mediaType = imageData.type || 'image/jpeg';

  let extracted: ExtractedContact;
  try {
    const imageBytes = new Uint8Array(await imageData.arrayBuffer());
    const base64Image = uint8ArrayToBase64(imageBytes);
    extracted = await extractContactInfo(apiKey, base64Image, mediaType);
  } catch (err) {
    // REAL BUG, found live 2026-08-10: the original version of this line
    // was `btoa(String.fromCharCode(...imageBytes))` - spreading a real
    // flier image's bytes (hundreds of KB, easily into the millions of
    // bytes for a dense flier graphic) as individual function arguments
    // blows past V8/Deno's max-argument limit and throws "Maximum call
    // stack size exceeded" - an uncaught RangeError that surfaced to
    // every caller as a raw 500 Internal Server Error, not the graceful
    // {skipped: true} this function is supposed to degrade to. Confirmed
    // live: all 6 real flier uploads this session silently produced no
    // contact info because of exactly this - none of them were small
    // enough to survive the spread. Now inside this try/catch AND fixed
    // at the source (uint8ArrayToBase64() below chunks instead of
    // spreading), so a still-unanticipated encoding failure degrades
    // gracefully instead of throwing raw past the caller again.
    console.error('Flier contact extraction failed', err);
    return Response.json({ skipped: true, reason: 'AI extraction temporarily unavailable' });
  }

  return Response.json({ contactInfo: extracted.contactInfo });
});

// NEW, added 2026-08-10 - see this file's header comment on the
// try/catch above for what this replaces and why. Processes the byte
// array in small chunks so String.fromCharCode() is never called with
// more arguments than the engine allows, regardless of image size.
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

async function extractContactInfo(apiKey: string, base64Image: string, mediaType: string): Promise<ExtractedContact> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
            {
              type: 'text',
              text:
                'This is a photo/scan of a team roping event flier. Find whatever tells a contestant ' +
                'HOW TO ENTER or WHO TO CONTACT for this event - a contact name with a phone number, an ' +
                'email address, a website to enter through, or similar. Respond with ONLY a JSON object ' +
                '(no other text, no markdown fences) in this exact shape:\n' +
                '{"contactInfo": string or null}\n' +
                'contactInfo should be a short, plain-text line combining what you found - e.g. ' +
                '"Contact Blake Larmon 918-837-0048 or Tim Victory 918-798-0159" or ' +
                '"Enter online at allstarteamroping.com". Do NOT transcribe the whole flier - only the ' +
                'entry/contact details. If the flier has no legible contact or entry information at all, ' +
                'return null rather than guessing.',
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
