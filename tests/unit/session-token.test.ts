import { decodeProtectedHeader, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_MAX_AGE, signSessionToken, verifySessionToken } from '@/lib/session-token';

const SECRET = 'unit-test-secret-0123456789abcdef-0123456789';
const claims = { userId: 'user_1', email: 'a@example.com', sv: 3 };
const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const key = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('signSessionToken / verifySessionToken', () => {
  it('round-trips the claims', async () => {
    const token = await signSessionToken(claims);
    expect(await verifySessionToken(token)).toEqual(claims);
  });

  it('signs with HS256 and a 7-day expiry', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
    const token = await signSessionToken(claims);
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe('user_1');
    expect(payload.exp - payload.iat).toBe(SESSION_MAX_AGE);
    expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
  });

  it('accepts a token just before expiry and rejects it after', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
    const token = await signSessionToken(claims);
    vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE - 60) * 1000));
    expect(await verifySessionToken(token)).toEqual(claims);
    vi.setSystemTime(new Date(Date.now() + 120 * 1000));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    const forged = await new SignJWT({ email: claims.email, sv: claims.sv })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setExpirationTime('1h')
      .sign(key('another-secret-another-secret-another-secret'));
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it('rejects a token after JWT_SECRET is rotated', async () => {
    const token = await signSessionToken(claims);
    vi.stubEnv('JWT_SECRET', `${SECRET}-rotated`);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('rejects alg=none (unsigned) tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub: claims.userId, email: claims.email, sv: claims.sv, iat: now, exp: now + 3600 };
    expect(await verifySessionToken(`${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`)).toBeNull();
    expect(await verifySessionToken(`${b64url({ alg: 'none' })}.${b64url(payload)}`)).toBeNull();
  });

  it('rejects other algorithms even with the right secret', async () => {
    const hs512 = await new SignJWT({ email: claims.email, sv: claims.sv })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(claims.userId)
      .setExpirationTime('1h')
      .sign(key(SECRET));
    expect(await verifySessionToken(hs512)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const [h, , s] = (await signSessionToken(claims)).split('.');
    const now = Math.floor(Date.now() / 1000);
    const evil = b64url({ sub: 'admin', email: claims.email, sv: claims.sv, iat: now, exp: now + 3600 });
    expect(await verifySessionToken(`${h}.${evil}.${s}`)).toBeNull();
  });

  it('rejects tokens with missing or malformed claims', async () => {
    const sign = (payload: Record<string, unknown>, sub?: string) => {
      const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h');
      if (sub !== undefined) jwt.setSubject(sub);
      return jwt.sign(key(SECRET));
    };
    expect(await verifySessionToken(await sign({ email: 'a@example.com', sv: 0 }))).toBeNull(); // no sub
    expect(await verifySessionToken(await sign({ email: 'a@example.com', sv: 0 }, ''))).toBeNull();
    expect(await verifySessionToken(await sign({ sv: 0 }, 'u'))).toBeNull(); // no email
    expect(await verifySessionToken(await sign({ email: 'a@example.com' }, 'u'))).toBeNull(); // pre-sv token
    expect(await verifySessionToken(await sign({ email: 'a@example.com', sv: 1.5 }, 'u'))).toBeNull();
    expect(await verifySessionToken(await sign({ email: 'a@example.com', sv: '1' }, 'u'))).toBeNull();
    expect(await verifySessionToken(await sign({ email: 'a@example.com', sv: 0 }, 'u'))).toEqual({
      userId: 'u',
      email: 'a@example.com',
      sv: 0,
    });
  });

  it('rejects garbage', async () => {
    for (const t of ['', 'abc', 'a.b.c', `${b64url({ alg: 'HS256' })}..`]) {
      expect(await verifySessionToken(t)).toBeNull();
    }
  });

  it('requires JWT_SECRET', async () => {
    const token = await signSessionToken(claims);
    vi.stubEnv('JWT_SECRET', '');
    await expect(signSessionToken(claims)).rejects.toThrow('JWT_SECRET is required');
    expect(await verifySessionToken(token)).toBeNull();
  });
});
