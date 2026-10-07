// lib/session-token.ts
// Session JWT signing/verification with jose (HS256 only).
// No database or next/headers access here, so proxy.ts can import it too.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'recepita_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

const ALG = 'HS256';

export type SessionClaims = {
  userId: string;
  email: string;
  /** User.sessionVersion at the time the token was issued. */
  sv: number;
};

let warnedShortSecret = false;

function getKey(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET is required');
  if (secret.length < 32 && !warnedShortSecret) {
    warnedShortSecret = true;
    console.warn('[auth] JWT_SECRET is shorter than 32 characters; use a long random value.');
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, sv: claims.sv })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(getKey());
}

/**
 * Verifies signature (HS256 only) and expiry. Returns null for anything
 * invalid, including tokens issued before session versions existed.
 * Does NOT check revocation; lib/auth-server.ts#getSession does that.
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: [ALG] });
    const { sub, email, sv } = payload;
    if (typeof sub !== 'string' || !sub) return null;
    if (typeof email !== 'string') return null;
    if (typeof sv !== 'number' || !Number.isInteger(sv)) return null;
    return { userId: sub, email, sv };
  } catch {
    return null;
  }
}
