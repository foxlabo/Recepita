// lib/retry-after.ts
// Shared by the OCR route (server) and the OCR client helper (browser).

/** Retry-After header value (delay in seconds or an HTTP date) → milliseconds; 0 when absent/invalid. */
export function parseRetryAfter(h?: string | null): number {
  if (!h) return 0;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n * 1000));
  const d = Date.parse(h);
  return Number.isNaN(d) ? 0 : Math.max(0, d - Date.now());
}
