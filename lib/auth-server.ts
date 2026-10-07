// lib/auth-server.ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleRouteError, UnauthorizedError } from '@/lib/http';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSessionToken, verifySessionToken } from '@/lib/session-token';

export { SESSION_COOKIE } from '@/lib/session-token';
export { jsonError, UnauthorizedError } from '@/lib/http';

export type Session = { userId: string; email: string; sessionVersion: number };

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

/** Issue a session JWT for the user and store it in the session cookie. */
export async function startSession(user: { id: string; email: string; sessionVersion: number }) {
  const token = await signSessionToken({ userId: user.id, email: user.email, sv: user.sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MAX_AGE });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
}

/** Cookie attributes for clearing the session on a manually built response. */
export const clearedSessionCookie = () => ({
  name: SESSION_COOKIE,
  value: '',
  ...cookieOptions(),
  maxAge: 0,
});

/**
 * Returns the current session, or null when the cookie is missing, the JWT is
 * invalid/expired, the user no longer exists or is deleted, or the token's
 * session version was revoked (User.sessionVersion was incremented).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, sessionVersion: true, isDeleted: true },
  });
  if (!user || user.isDeleted || user.sessionVersion !== claims.sv) return null;

  return { userId: user.id, email: user.email, sessionVersion: user.sessionVersion };
});

/** Returns the session or throws UnauthorizedError (→ 401 via withAuth). */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * Revoke every session of the user. Returns the new version so the caller can
 * re-issue a cookie for the current device if desired.
 */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return u.sessionVersion;
}

type RouteCtx<P> = { params: Promise<P> };

/**
 * Wrap an API route handler: requires a valid session (401
 * `{ error: 'unauthorized' }` otherwise) and turns thrown errors into safe
 * JSON responses.
 */
export function withAuth<P extends Record<string, string | string[]> = {}>(
  handler: (req: NextRequest, ctx: { session: Session; params: P }) => Promise<Response> | Response,
) {
  return async (req: NextRequest, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      const session = await requireUser();
      return await handler(req, { session, params: await ctx.params });
    } catch (e) {
      return handleRouteError(e);
    }
  };
}
