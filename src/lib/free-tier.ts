// Errors raised by the free-tier limit triggers (migration 0129). The database says which limit it was in the error's `hint`;
// this turns that into a normal Error so every screen's existing `err instanceof Error ? err.message : ...` toast shows the
// plain-English sentence the server wrote instead of a generic failure.
export type FreeTierLimit = 'open_request_limit' | 'need_post_limit';

export class FreeTierLimitError extends Error {
  limit: FreeTierLimit;
  constructor(limit: FreeTierLimit, message: string) {
    super(message);
    this.name = 'FreeTierLimitError';
    this.limit = limit;
  }
}

export function toLimitError(error: { message: string; hint?: string | null }): Error {
  if (error.hint === 'open_request_limit' || error.hint === 'need_post_limit') {
    return new FreeTierLimitError(error.hint, error.message);
  }
  return new Error(error.message);
}
