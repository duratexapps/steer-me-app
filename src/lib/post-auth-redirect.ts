// "Sign in, then take me back to the tool I opened." The members-only travel tools set this just before sending
// someone to the sign-in screen; sign-in reads it once after a successful login. Only these paths are honored,
// so a crafted value can never send a member somewhere else.

const ALLOWED = ['/travel', '/layovers'];
const KEY = 'post_auth_redirect';
let pending: string | null = null;

export function setPostAuthRedirect(path: string) {
  if (!ALLOWED.some((p) => path === p || path.startsWith(p + '?'))) return;
  pending = path;
  try {
    (globalThis as { sessionStorage?: Storage }).sessionStorage?.setItem(KEY, path);
  } catch {
    /* in-memory copy is enough */
  }
}

export function consumePostAuthRedirect(): string | null {
  let path = pending;
  pending = null;
  try {
    const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    path = path ?? ss?.getItem(KEY) ?? null;
    ss?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return path && ALLOWED.some((p) => path === p || path.startsWith(p + '?')) ? path : null;
}
