// lib/app-url.ts
// Base URL for links in e-mails. Always taken from configuration, never from
// the request's Host/Origin headers (which a client can spoof).
import 'server-only';

export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (raw) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`APP_URL is not a valid absolute URL: ${raw}`);
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must be set in production (it is used to build links in e-mails).');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** Absolute URL for an app path, e.g. appUrl('/api/account/email/verify', { token }). */
export function appUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(getAppUrl() + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Whether API responses may include verification links (local development
 * convenience). Requires NODE_ENV !== 'production' AND SHOW_DEV_VERIFICATION_LINK=1.
 */
export function showDevVerificationLink(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.SHOW_DEV_VERIFICATION_LINK === '1';
}
