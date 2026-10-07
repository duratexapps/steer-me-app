// Reads an event flier image and records WHICH ASSOCIATION runs/sanctions it
// (WSTR, USTRC, NTR, or the 40+ Team Roping Championships) as events.tags,
// powering the Browse Events type chips (migration 0071).
//
// Called only with the service-role key (the admin posting script and the
// one-off backfill) - never from the app. Same standing safety policy as the
// other AI functions (see _shared/ai-safety-prompt.ts): the model only ever
// returns a fixed enum list, so nothing written on a flier can reach the
// database except one of four known strings.
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { buildExtractionSystemPrompt } from '../_shared/ai-safety-prompt.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5-5'; // Haiku read membership small print as branding; the stronger model follows the where-printed rule

const SYSTEM_PROMPT = buildExtractionSystemPrompt(
  'read a team roping event flier and name only the roping association(s) that run or sanction the event.',
  'a list drawn only from this fixed set: wstr, ustrc, ntr, over40'
);

Deno.serve(async (req) => {
  // The platform gateway has already verified this JWT's signature
  // (verify_jwt is on for this function), so only the role claim needs
  // checking: this must be a service-role call, never an app user's token.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  let role: string | undefined;
  try {
    role = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
  } catch {
    role = undefined;
  }
  if (role !== 'service_role') return new Response('Unauthorized', { status: 401 });
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return Response.json({ skipped: true, reason: 'AI not configured' });

  let body: { eventIds?: string[]; debug?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const ids = (body.eventIds ?? []).slice(0, 40);
  if (!ids.length) return Response.json({ error: 'eventIds required' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: events, error } = await admin.from('events').select('id, name, flier_path').in('id', ids);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Record<string, string[] | string> = {};
  for (const ev of events ?? []) {
    if (!ev.flier_path) {
      // No flier to read: fall back to what the event's own name says.
      const nameOnly = finalTags([], ev.name);
      await admin.from('events').update({ tags: nameOnly, tags_checked_at: new Date().toISOString() }).eq('id', ev.id);
      results[ev.id] = nameOnly;
      continue;
    }
    try {
      const { data: img, error: dlErr } = await admin.storage.from('event-fliers').download(ev.flier_path);
      if (dlErr || !img) {
        // The file is missing from storage (permanent): fall back to the name so this event isn't retried forever.
        const nameOnly = finalTags([], ev.name);
        await admin.from('events').update({ tags: nameOnly, tags_checked_at: new Date().toISOString() }).eq('id', ev.id);
        results[ev.id] = nameOnly;
        continue;
      }
      // Storage may report a generic type and extensions can lie (a .png that
      // is really a JPEG was rejected by the API), so go by the file's own
      // magic bytes.
      const bytes = new Uint8Array(await img.arrayBuffer());
      const mediaType = sniffImageType(bytes);
      if (!mediaType) {
        results[ev.id] = 'not an image';
        continue;
      }
      const { tags: imageTags, seen } = await readAssociations(apiKey, toBase64(bytes), mediaType);
      const tags = finalTags(imageTags, ev.name);
      const { error: upErr } = await admin
        .from('events')
        .update({ tags, tags_checked_at: new Date().toISOString() })
        .eq('id', ev.id);
      if (upErr) throw new Error(upErr.message);
      results[ev.id] = body.debug ? ({ tags, seen } as unknown as string[]) : tags;
    } catch (e) {
      console.error('tag-event-flier failed', ev.id, e);
      results[ev.id] = `error: ${e instanceof Error ? e.message : 'unknown'}`;
    }
  }
  return Response.json({ results });
});

// Image reading plus what the event's own name says. The name is reliable for
// "WSTR 2027 Qualifier - Buckeye" and missed nothing it names, while the
// image catches events whose name omits the association. "Over 40" as a
// DIVISION in a title ("#10 Over 40 & CanAm...") is not an over-40 event, so
// that tag from the name needs the "40+" form; and an "Any Age" / "All Ages"
// event is not over-40 whatever one division says.
export function finalTags(imageTags: string[], name: string): string[] {
  const out = new Set(imageTags);
  if (/\bWSTR\b/i.test(name)) out.add('wstr');
  if (/\bUSTRC\b/i.test(name)) out.add('ustrc');
  if (/\bNTR\b/.test(name)) out.add('ntr');
  const name40 = /(^|[^0-9])40\s*\+/.test(name);
  if (name40) out.add('over40');
  else if (/\b(any|all)\s+ages?\b/i.test(name)) out.delete('over40');
  return [...out];
}

function sniffImageType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

// The model only TRANSCRIBES organization names printed in the flier's
// header or as large logos; the mapping to tags is fixed rules here. Asking
// it to classify directly guessed from lookalike letters (a "WCTR" logo came
// back as "wstr") and from small-print membership lines.
function mapToTags(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = raw.toUpperCase().replace(/[^A-Z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\bWSTR\b/.test(n) || n.includes('WORLD SERIES OF TEAM ROPING')) out.add('wstr');
    if (/\bUSTRC\b/.test(n) || n.includes('UNITED STATES TEAM ROPING')) out.add('ustrc');
    if (/\bNTR\b/.test(n) || n.includes('NATIONAL TEAM ROPERS')) out.add('ntr');
    if (n === 'OVER40' || /\bOVER 40\b/.test(n) || /^40 ?\+/.test(n) || n.includes('40 TEAM ROPING CHAMPIONSHIPS') || n.includes('40+ TEAM ROPING') || n.includes('40 PLUS TEAM ROPING')) out.add('over40');
  }
  return [...out];
}

async function readAssociations(apiKey: string, base64: string, mediaType: string): Promise<{ tags: string[]; seen: unknown }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text:
                'Find every roping ASSOCIATION or SANCTIONING-BODY name (e.g. WSTR, USTRC, NTR, 40+ Team Roping ' +
                'Championships, WCTR) that appears anywhere on this flier, copied exactly as printed, and for each say ' +
                'WHERE it is printed: "branding" = part of the event\'s own title, header, or a large logo that ' +
                'presents the event; "small_print" = a membership/rules line such as "membership accepted/required"; ' +
                '"sponsor" = one of the sponsor logos or a sponsor strip. Respond with ONLY JSON: ' +
                '{"names": [{"text": "...", "where": "branding|small_print|sponsor"}]}',
            },
          ],
        },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Anthropic ${response.status} ${text.slice(0, 200)}`);
  const blocks = JSON.parse(text).content ?? [];
  const content = blocks.find((b: any) => b.type === 'text')?.text ?? '';
  if (!content) throw new Error(`No text block: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  const names: string[] = Array.isArray(parsed.names)
    ? parsed.names
        .filter((v: any) => v && typeof v.text === 'string' && v.where === 'branding')
        .map((v: any) => v.text)
        .slice(0, 8)
    : [];
  return { tags: mapToTags(names), seen: parsed.names };
}
