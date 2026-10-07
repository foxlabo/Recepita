import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, signSessionToken } from '@/lib/session-token';
import { config, proxy } from '@/proxy';

const ORIGIN = 'http://localhost:4450';

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'unit-test-secret-0123456789abcdef-0123456789');
  vi.stubEnv('APP_URL', 'https://recepita.example');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function request(path: string, init: { method?: string; token?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  headers.set('host', 'localhost:4450');
  if (init.token) headers.set('cookie', `${SESSION_COOKIE}=${init.token}`);
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers }));
}

const validToken = () => signSessionToken({ userId: 'u1', email: 'a@example.com', sv: 0 });
const location = (res: Response) => {
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};
const passesThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe('proxy: pages', () => {
  it('redirects unauthenticated page requests to /login with ?next=', async () => {
    const res = await request('/receipts?year=2026&month=9');
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`/login?next=${encodeURIComponent('/receipts?year=2026&month=9')}`);
  });

  it('treats an invalid or expired cookie as logged out', async () => {
    expect(location(await request('/dashboard', { token: 'garbage' }))).toBe('/login?next=%2Fdashboard');
  });

  it('lets authenticated requests through', async () => {
    expect(passesThrough(await request('/dashboard', { token: await validToken() }))).toBe(true);
  });

  it('routes / by session', async () => {
    expect(location(await request('/'))).toBe('/login');
    expect(location(await request('/?x=1', { token: await validToken() }))).toBe('/dashboard');
  });

  it('serves /login and /signup to guests and sends signed-in users to the dashboard', async () => {
    expect(passesThrough(await request('/login?next=%2Freceipts'))).toBe(true);
    expect(passesThrough(await request('/signup'))).toBe(true);
    expect(location(await request('/login', { token: await validToken() }))).toBe('/dashboard');
  });
});

describe('proxy: API', () => {
  it('answers 401 JSON for protected APIs without a session', async () => {
    const res = await request('/api/expenses/list');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('keeps public APIs public', async () => {
    for (const path of ['/api/auth/login', '/api/auth/signup', '/api/ping', '/api/account/email/verify?token=x']) {
      const method = path.startsWith('/api/auth/') ? 'POST' : 'GET';
      expect(passesThrough(await request(path, { method })), path).toBe(true);
    }
  });

  it('does not treat look-alike paths as public', async () => {
    expect((await request('/api/auth/login-admin', { method: 'POST' })).status).toBe(401);
    expect((await request('/api/pingx')).status).toBe(401);
  });

  it('rejects cross-origin state-changing API requests (CSRF)', async () => {
    const token = await validToken();
    for (const origin of ['https://evil.example', 'null', 'http://localhost:4451']) {
      const res = await request('/api/expenses/bulk-delete', { method: 'POST', token, headers: { origin } });
      expect(res.status, origin).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
    }
    // also before authentication (login CSRF)
    expect(
      (await request('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403);
  });

  it('accepts same-origin, APP_URL-origin and Origin-less requests', async () => {
    const token = await validToken();
    const variants: Record<string, string>[] = [{ origin: ORIGIN }, { origin: 'https://recepita.example' }, {}];
    for (const headers of variants) {
      const res = await request('/api/expenses/bulk-delete', { method: 'POST', token, headers });
      expect(passesThrough(res)).toBe(true);
    }
    const viaProxy = await request('/api/expenses/bulk-delete', {
      method: 'POST',
      token,
      headers: { origin: 'https://app.example', 'x-forwarded-host': 'app.example' },
    });
    expect(passesThrough(viaProxy)).toBe(true);
  });

  it('does not check the origin of safe methods', async () => {
    const res = await request('/api/expenses/list', {
      token: await validToken(),
      headers: { origin: 'https://evil.example' },
    });
    expect(passesThrough(res)).toBe(true);
  });
});

describe('proxy matcher', () => {
  it('skips static assets', () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test('/dashboard')).toBe(true);
    expect(re.test('/api/ocr')).toBe(true);
    expect(re.test('/_next/static/chunks/app.js')).toBe(false);
    expect(re.test('/manifest.json')).toBe(false);
    expect(re.test('/icon-192.png')).toBe(false);
  });
});
