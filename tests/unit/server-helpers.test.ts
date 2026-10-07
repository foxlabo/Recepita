import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Pure helpers that live in modules which also import the Prisma client; the
// client is replaced so these tests never need a database.
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

const { appUrl, getAppUrl, showDevVerificationLink } = await import('@/lib/app-url');
const { escapeHtml, sendMail } = await import('@/lib/mail');
const { BCRYPT_COST, hashPassword, needsRehash, verifyPassword } = await import('@/lib/password');
const { clientIp, RATE_LIMITS } = await import('@/lib/rate-limit');
const { tombstoneEmail } = await import('@/lib/users');
const { hashToken, TOKEN_TTL_MINUTES } = await import('@/lib/verification');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('passwords', () => {
  it('hashes with cost 12 and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(BCRYPT_COST).toBe(12);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('is false for unknown users / unusable hashes and never throws', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', undefined)).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plaintext-password')).toBe(false);
    expect(await verifyPassword('x', '$2b$04$invalid')).toBe(false);
  });

  it('asks for a rehash of older, cheaper hashes only', async () => {
    expect(needsRehash(await bcrypt.hash('x', 4))).toBe(true);
    expect(needsRehash(`$2b$12$${'a'.repeat(53)}`)).toBe(false);
    expect(needsRehash('garbage')).toBe(false);
  });
});

describe('app URL', () => {
  it('uses APP_URL without a trailing slash', () => {
    vi.stubEnv('APP_URL', 'https://recepita.example/app/ ');
    expect(getAppUrl()).toBe('https://recepita.example/app');
    expect(appUrl('/api/account/email/verify', { token: 'a b&c' })).toBe(
      'https://recepita.example/app/api/account/email/verify?token=a+b%26c',
    );
  });

  it('rejects an invalid APP_URL and requires it in production', () => {
    vi.stubEnv('APP_URL', 'not a url');
    expect(() => getAppUrl()).toThrow(/APP_URL is not a valid absolute URL/);
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getAppUrl()).toThrow(/APP_URL must be set in production/);
  });

  it('falls back to localhost in development', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORT', '4321');
    expect(getAppUrl()).toBe('http://localhost:4321');
  });

  it('shows verification links only in development with the flag', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SHOW_DEV_VERIFICATION_LINK', '1');
    expect(showDevVerificationLink()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(showDevVerificationLink()).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SHOW_DEV_VERIFICATION_LINK', 'true');
    expect(showDevVerificationLink()).toBe(false);
  });
});

describe('mail', () => {
  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('prints instead of sending outside production when ACS is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AZURE_COMMUNICATION_CONNECTION_STRING', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await sendMail({ to: 'a@example.com', subject: 'S', text: 'link: http://x', html: '<p>x</p>' });
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0][0]).toContain('link: http://x');
  });

  it('refuses to silently drop mail in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AZURE_COMMUNICATION_CONNECTION_STRING', '');
    await expect(sendMail({ to: 'a@example.com', subject: 'S', text: 't', html: 'h' })).rejects.toThrow(
      /Mail is not configured/,
    );
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });

  it.each([
    [{ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, '203.0.113.5'],
    [{ 'x-forwarded-for': ' 203.0.113.5:51234 ' }, '203.0.113.5'],
    [{ 'x-forwarded-for': '[2001:db8::1]:443' }, '2001:db8::1'],
    [{ 'x-forwarded-for': '2001:db8::1' }, '2001:db8::1'],
    [{ 'x-real-ip': '198.51.100.7' }, '198.51.100.7'],
    [{ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.7' }, '198.51.100.7'],
    [{}, 'unknown'],
  ])('%o → %s', (headers, expected) => {
    expect(clientIp(req(headers))).toBe(expected);
  });

  it('caps unexpected values', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'x'.repeat(500) }))).toHaveLength(64);
  });

  it('has the documented limits', () => {
    expect(RATE_LIMITS.login).toEqual({ name: 'login:ip-email', limit: 5, windowSec: 900 });
    expect(RATE_LIMITS.ocrDay.limit).toBe(500);
  });
});

describe('verification tokens / users (pure parts)', () => {
  it('stores only the SHA-256 of a token', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashToken('abc')).not.toContain('abc');
    expect(TOKEN_TTL_MINUTES).toBe(30);
  });

  it('tombstone e-mail cannot be a real address', () => {
    expect(tombstoneEmail('u1')).toBe('deleted+u1@invalid');
  });
});
