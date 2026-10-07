import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// next/headers needs a request scope; route handlers and lib/auth-server.ts
// only use cookies(), which is replaced by an in-memory jar.
type Cookie = { name: string; value: string; [option: string]: unknown };
const jar = new Map<string, Cookie>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (nameOrCookie: string | Cookie, value?: string, options?: Record<string, unknown>) => {
      const c =
        typeof nameOrCookie === 'string' ? { name: nameOrCookie, value: value ?? '', ...options } : nameOrCookie;
      jar.set(c.name, c);
    },
  }),
}));

const { prisma } = await import('@/lib/prisma');
const { bumpSessionVersion, clearSessionCookie, getSession, requireUser, startSession, withAuth } = await import(
  '@/lib/auth-server'
);
const { UnauthorizedError } = await import('@/lib/http');
const { BCRYPT_COST } = await import('@/lib/password');
const { RATE_LIMITS } = await import('@/lib/rate-limit');
const { SESSION_COOKIE, SESSION_MAX_AGE } = await import('@/lib/session-token');
const { findUserByEmail } = await import('@/lib/users');
const { consumeToken, hashToken, issueToken, TokenRejected } = await import('@/lib/verification');
const { POST: login } = await import('@/app/api/auth/login/route');

const RUN = randomUUID().slice(0, 8);
const DOMAIN = `it-${RUN}.example.test`;
const PASSWORD = 'integration-pass-123';
let passwordHash: string;
/** "<ip>|<email>" identifiers the login limiter saw, for clean-up. */
const limiterIds = new Set<string>();
let ipSeq = 0;
const loginKey = (id: string) => `${RATE_LIMITS.login.name}:${createHash('sha256').update(id).digest('hex')}`;

/** Unique address per test. */
const email = (label: string) => `${label}-${randomUUID().slice(0, 6)}@${DOMAIN}`;

async function createUser(data: { email: string; verified?: boolean; deleted?: boolean; hash?: string }) {
  return prisma.user.create({
    data: {
      email: data.email,
      password: data.hash ?? passwordHash,
      isEmailVerified: data.verified ?? true,
      isDeleted: data.deleted ?? false,
    },
  });
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
});

beforeEach(() => {
  jar.clear();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}`, mode: 'insensitive' } } });
  await prisma.rateLimit.deleteMany({ where: { key: { in: [...limiterIds].map(loginKey) } } });
  await prisma.$disconnect();
});

describe('findUserByEmail', () => {
  it('finds lower-cased addresses exactly', async () => {
    const u = await createUser({ email: email('exact') });
    expect((await findUserByEmail(`  ${u.email.toUpperCase()} `))?.id).toBe(u.id);
  });

  it('finds legacy accounts stored with upper-case letters', async () => {
    const stored = `Legacy.User-${RUN}@${DOMAIN.toUpperCase()}`;
    const u = await createUser({ email: stored });
    expect((await findUserByEmail(stored.toLowerCase()))?.id).toBe(u.id);
  });

  it('returns null for unknown addresses', async () => {
    expect(await findUserByEmail(email('nobody'))).toBeNull();
  });
});

describe('verification tokens', () => {
  it('stores only the hash of the token', async () => {
    const u = await createUser({ email: email('hash'), verified: false });
    const raw = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    const rows = await prisma.verificationToken.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(raw));
    expect(JSON.stringify(rows)).not.toContain(raw);
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
  });

  it('is single-use and applies the change in the same transaction', async () => {
    const u = await createUser({ email: email('verify'), verified: false });
    const raw = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    const ok = await consumeToken(raw, 'EMAIL_VERIFY', async (tx, vt) => {
      await tx.user.update({ where: { id: vt.userId }, data: { isEmailVerified: true } });
    });
    expect(ok.ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).isEmailVerified).toBe(true);
    expect(await consumeToken(raw, 'EMAIL_VERIFY', async () => {})).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token of another type without consuming it', async () => {
    const u = await createUser({ email: email('type') });
    const raw = await issueToken(u.id, u.email, 'EMAIL_CHANGE');
    expect(await consumeToken(raw, 'EMAIL_VERIFY', async () => {})).toEqual({ ok: false, reason: 'invalid' });
    expect((await consumeToken(raw, 'EMAIL_CHANGE', async () => {})).ok).toBe(true);
  });

  it('rejects and deletes expired tokens', async () => {
    const u = await createUser({ email: email('expired'), verified: false });
    const raw = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    await prisma.verificationToken.updateMany({
      where: { userId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const apply = vi.fn();
    expect(await consumeToken(raw, 'EMAIL_VERIFY', apply)).toEqual({ ok: false, reason: 'expired' });
    expect(apply).not.toHaveBeenCalled();
    expect(await prisma.verificationToken.count({ where: { userId: u.id } })).toBe(0);
  });

  it('a new token replaces the previous one of the same type only', async () => {
    const u = await createUser({ email: email('reissue'), verified: false });
    const first = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    const change = await issueToken(u.id, `new-${u.email}`, 'EMAIL_CHANGE');
    const second = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    expect(await consumeToken(first, 'EMAIL_VERIFY', async () => {})).toEqual({ ok: false, reason: 'invalid' });
    expect((await consumeToken(second, 'EMAIL_VERIFY', async () => {})).ok).toBe(true);
    expect((await consumeToken(change, 'EMAIL_CHANGE', async () => {})).ok).toBe(true);
  });

  it('only one of several concurrent requests can use a token', async () => {
    const u = await createUser({ email: email('race'), verified: false });
    const raw = await issueToken(u.id, u.email, 'EMAIL_VERIFY');
    const apply = vi.fn(async () => {});
    const results = await Promise.all(Array.from({ length: 6 }, () => consumeToken(raw, 'EMAIL_VERIFY', apply)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(apply).toHaveBeenCalledOnce();
  });

  it('rolls back when the change is rejected (address taken)', async () => {
    const taken = await createUser({ email: email('taken') });
    const u = await createUser({ email: email('mover') });
    const raw = await issueToken(u.id, taken.email, 'EMAIL_CHANGE');
    const result = await consumeToken(raw, 'EMAIL_CHANGE', async (tx, vt) => {
      await tx.user.update({ where: { id: vt.userId }, data: { email: vt.email } }); // unique violation → P2002
    });
    expect(result).toEqual({ ok: false, reason: 'taken' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);
    // the token was not consumed by the failed attempt
    expect(await prisma.verificationToken.count({ where: { tokenHash: hashToken(raw) } })).toBe(1);

    const rejected = await consumeToken(raw, 'EMAIL_CHANGE', async () => {
      throw new TokenRejected('expired');
    });
    expect(rejected).toEqual({ ok: false, reason: 'expired' });
    expect(await prisma.verificationToken.count({ where: { tokenHash: hashToken(raw) } })).toBe(1);
  });

  it('rejects missing, unknown and oversized tokens', async () => {
    expect(await consumeToken(null, 'EMAIL_VERIFY', async () => {})).toEqual({ ok: false, reason: 'invalid' });
    expect(await consumeToken('nope', 'EMAIL_VERIFY', async () => {})).toEqual({ ok: false, reason: 'invalid' });
    expect(await consumeToken('x'.repeat(257), 'EMAIL_VERIFY', async () => {})).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('sessions (lib/auth-server.ts)', () => {
  it('startSession sets an httpOnly cookie that getSession accepts', async () => {
    const u = await createUser({ email: email('session') });
    await startSession(u);
    const cookie = jar.get(SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE });
    expect(await getSession()).toEqual({ userId: u.id, email: u.email, sessionVersion: 0 });
    expect((await requireUser()).userId).toBe(u.id);
  });

  it('bumpSessionVersion revokes existing sessions', async () => {
    const u = await createUser({ email: email('revoke') });
    await startSession(u);
    expect(await bumpSessionVersion(u.id)).toBe(1);
    expect(await getSession()).toBeNull();
    await startSession({ ...u, sessionVersion: 1 });
    expect((await getSession())?.sessionVersion).toBe(1);
  });

  it('rejects sessions of deleted users', async () => {
    const soft = await createUser({ email: email('soft') });
    await startSession(soft);
    await prisma.user.update({ where: { id: soft.id }, data: { isDeleted: true } });
    expect(await getSession()).toBeNull();

    const hard = await createUser({ email: email('hard') });
    await startSession(hard);
    await prisma.user.delete({ where: { id: hard.id } });
    expect(await getSession()).toBeNull();
  });

  it('no cookie / a forged cookie is no session', async () => {
    expect(await getSession()).toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    jar.set(SESSION_COOKIE, { name: SESSION_COOKIE, value: 'eyJhbGciOiJub25lIn0.e30.' });
    expect(await getSession()).toBeNull();
  });

  it('clearSessionCookie expires the cookie', async () => {
    const u = await createUser({ email: email('clear') });
    await startSession(u);
    await clearSessionCookie();
    expect(jar.get(SESSION_COOKIE)).toMatchObject({ value: '', maxAge: 0 });
    expect(await getSession()).toBeNull();
  });

  it('withAuth passes the session and answers 401 without one', async () => {
    const handler = withAuth(async (_req, { session }) => Response.json({ userId: session.userId }));
    const req = new NextRequest('http://localhost/api/x');
    const ctx = { params: Promise.resolve({}) };
    const anon = await handler(req, ctx);
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: 'unauthorized' });

    const u = await createUser({ email: email('withauth') });
    await startSession(u);
    expect(await (await handler(req, ctx)).json()).toEqual({ userId: u.id });
  });
});

describe('POST /api/auth/login', () => {
  const INVALID = 'メールアドレスまたはパスワードが違います';

  function call(body: unknown, ip = newIp()) {
    const b = body as { email?: unknown };
    if (typeof b?.email === 'string') limiterIds.add(`${ip}|${b.email.trim().toLowerCase()}`);
    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return login(req, { params: Promise.resolve({}) });
  }
  function newIp() {
    ipSeq++;
    return `198.18.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
  }

  it('logs in a verified user and sets the session cookie', async () => {
    const u = await createUser({ email: email('login') });
    const res = await call({ email: `  ${u.email.toUpperCase()} `, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await getSession())?.userId).toBe(u.id);
  });

  it('gives the same generic 401 for a wrong password, an unknown, unverified or deleted account', async () => {
    const ok = await createUser({ email: email('generic') });
    const unverified = await createUser({ email: email('unverified'), verified: false });
    const deleted = await createUser({ email: email('deleted'), deleted: true });
    const attempts = [
      { email: ok.email, password: 'wrong-password' },
      { email: email('unknown'), password: PASSWORD },
      { email: unverified.email, password: PASSWORD },
      { email: deleted.email, password: PASSWORD },
    ];
    for (const body of attempts) {
      const res = await call(body);
      expect(res.status, body.email).toBe(401);
      expect(await res.json()).toEqual({ error: INVALID });
    }
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('validates the body', async () => {
    expect((await call('{not json')).status).toBe(400);
    const res = await call({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'メールアドレスの形式が正しくありません。' });
  });

  it('limits attempts per IP + e-mail with 429 and Retry-After', async () => {
    const u = await createUser({ email: email('limited') });
    const ip = newIp();
    for (let i = 0; i < RATE_LIMITS.login.limit; i++) {
      expect((await call({ email: u.email, password: 'wrong' }, ip)).status).toBe(401);
    }
    const blocked = await call({ email: u.email, password: PASSWORD }, ip); // even the right password
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(RATE_LIMITS.login.windowSec);
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    // another IP for the same account is not affected
    expect((await call({ email: u.email, password: PASSWORD })).status).toBe(200);
  });

  it('resets the counter after a successful login', async () => {
    const u = await createUser({ email: email('resets') });
    const ip = newIp();
    const key = loginKey(`${ip}|${u.email}`);
    for (let i = 0; i < RATE_LIMITS.login.limit - 1; i++) await call({ email: u.email, password: 'wrong' }, ip);
    expect((await prisma.rateLimit.findUnique({ where: { key } }))?.count).toBe(RATE_LIMITS.login.limit - 1);
    expect((await call({ email: u.email, password: PASSWORD }, ip)).status).toBe(200);
    expect(await prisma.rateLimit.findUnique({ where: { key } })).toBeNull();
  });

  it('re-hashes old cost-10 hashes on login', async () => {
    const u = await createUser({ email: email('rehash'), hash: await bcrypt.hash(PASSWORD, 10) });
    expect((await call({ email: u.email, password: PASSWORD })).status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(bcrypt.getRounds(stored.password)).toBe(BCRYPT_COST);
    expect(await bcrypt.compare(PASSWORD, stored.password)).toBe(true);
  });
});
