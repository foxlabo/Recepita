// lib/safe-next.ts
// Validates the ?next= parameter of the login page (open-redirect defence).
// Only same-origin relative paths starting with a single "/" are accepted.

const BASE = 'https://recepita.invalid';

export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || raw.length > 2048) return fallback;
  // "//evil", "/\evil" and absolute / javascript: URLs are rejected outright.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  // Backslashes and control characters anywhere (browsers drop tab/CR/LF,
  // which would turn "/<TAB>/evil" into "//evil").
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return fallback;
    if (url.pathname === '/login' || url.pathname === '/signup' || url.pathname.startsWith('/api/')) {
      return fallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
