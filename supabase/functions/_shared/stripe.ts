// Small Stripe helpers shared by stripe-checkout, stripe-portal and stripe-webhook. No SDK: Stripe's REST API
// takes form-encoded bodies, and webhook signatures are an HMAC we can check with Web Crypto.

const STRIPE_API = 'https://api.stripe.com/v1';

// Flattens {a: {b: 1}, c: [x]} into Stripe's bracket syntax: a[b]=1&c[0]=x
export function toForm(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === 'object') toForm(v as Record<string, unknown>, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof value === 'object') {
      toForm(value as Record<string, unknown>, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export async function stripeRequest(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const form = toForm(params);
  const url = method === 'GET' && form.toString() ? `${STRIPE_API}${path}?${form}` : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? form.toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verifies a Stripe-Signature header ("t=...,v1=...") against the RAW request body. Rejects anything older than
// five minutes so a captured request cannot be replayed later.
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some((s) => timingSafeEqual(s, expected));
}

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://steerme.ropingtools.com';
