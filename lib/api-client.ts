// lib/api-client.ts
// Small helpers for client components calling the app's JSON API.

/**
 * When the session has expired the API answers 401: clear the cookie and go
 * to the login screen. Returns true if the caller should stop.
 */
export function redirectIfUnauthorized(res: Response): boolean {
  if (res.status !== 401) return false;
  location.href = '/api/auth/expired';
  return true;
}

/** Japanese error text from an API error response ({ error }), or `fallback`. */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const msg = typeof data?.error === 'string' ? data.error : '';
  // machine-readable codes (e.g. 'unauthorized', 'forbidden') are not shown as-is
  return msg && /[ぁ-んァ-ン一-龥]/.test(msg) ? msg : fallback;
}
