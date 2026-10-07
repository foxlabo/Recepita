import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safe-next';

describe('safeNextPath (login ?next=)', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/receipts?year=2026&month=9', '/receipts?year=2026&month=9'],
    ['/settings#profile', '/settings#profile'],
    ['/expenses/', '/expenses/'],
    ['/a/../receipts', '/receipts'],
    ['/%E7%B5%8C%E8%B2%BB', '/%E7%B5%8C%E8%B2%BB'],
  ])('keeps the same-origin path %j', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'dashboard',
    'https://evil.example/',
    'http://evil.example',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    ' /dashboard',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/\u0000',
    '/\u007f',
    '/a\\b',
    // dot segments that normalise to a protocol-relative URL
    '/..//evil.example',
    '/.//evil.example',
    '/a/..//evil.example',
    '/%2e%2e//evil.example',
    '/.%2E//evil.example/path?x=1',
    // pages that would loop or are not pages
    '/login',
    '/login?next=/dashboard',
    '/signup',
    '/api/auth/logout',
    `/${'a'.repeat(2048)}`,
  ])('falls back for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/dashboard');
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.example', '/receipts')).toBe('/receipts');
    expect(safeNextPath(null, '/settings')).toBe('/settings');
  });

  it('never returns something a browser would treat as another origin', () => {
    const tricky = ['/..//x', '/./\\x', '/%5c%5cx', '/.././/x', '/a/b/../../..//x', '/%09/x'];
    for (const raw of tricky) {
      const out = safeNextPath(raw);
      expect(new URL(out, 'https://app.example').origin).toBe('https://app.example');
    }
  });
});
