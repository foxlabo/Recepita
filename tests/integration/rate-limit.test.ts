import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { HttpError } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { enforce, hit, type RateLimitRule, reset } from '@/lib/rate-limit';

const RUN = randomUUID().slice(0, 8);
const rule = (name: string, limit: number, windowSec = 60): RateLimitRule => ({
  name: `it-${RUN}-${name}`,
  limit,
  windowSec,
});
/** Same key format as lib/rate-limit.ts: "<rule>:<sha256(identifier)>". */
const keyOf = (r: RateLimitRule, id: string) => `${r.name}:${createHash('sha256').update(id).digest('hex')}`;
const row = (r: RateLimitRule, id: string) => prisma.rateLimit.findUnique({ where: { key: keyOf(r, id) } });

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: `it-${RUN}-` } } });
  await prisma.$disconnect();
});

describe('hit: fixed window', () => {
  it('counts hits and blocks above the limit', async () => {
    const r = rule('fixed', 3, 60);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit(r, 'client-a'));
    expect(results.map((x) => x.count)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map((x) => x.allowed)).toEqual([true, true, true, false, false]);
    for (const x of results) {
      expect(x.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(x.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it('keeps identifiers and rules apart', async () => {
    const r1 = rule('apart-1', 1);
    const r2 = rule('apart-2', 1);
    expect((await hit(r1, 'x')).allowed).toBe(true);
    expect((await hit(r1, 'x')).allowed).toBe(false);
    expect((await hit(r1, 'y')).allowed).toBe(true);
    expect((await hit(r2, 'x')).allowed).toBe(true);
  });

  it('does not keep the window open forever: a new window starts after windowSec', async () => {
    const r = rule('expiry', 2, 60);
    await hit(r, 'client-b');
    await hit(r, 'client-b');
    expect((await hit(r, 'client-b')).allowed).toBe(false);

    // Move the window start back by just under / just over the window length.
    await prisma.$executeRaw`UPDATE "RateLimit" SET "windowStart" = "windowStart" - interval '59 seconds' WHERE "key" = ${keyOf(r, 'client-b')}`;
    const stillBlocked = await hit(r, 'client-b');
    expect(stillBlocked).toMatchObject({ allowed: false, count: 4 });
    expect(stillBlocked.retryAfterSec).toBeLessThanOrEqual(2);

    await prisma.$executeRaw`UPDATE "RateLimit" SET "windowStart" = "windowStart" - interval '2 seconds' WHERE "key" = ${keyOf(r, 'client-b')}`;
    const fresh = await hit(r, 'client-b');
    expect(fresh).toMatchObject({ allowed: true, count: 1 });
    expect(fresh.retryAfterSec).toBeGreaterThan(55);
  });

  it('really waits for a short window to pass', async () => {
    const r = rule('short', 1, 1);
    expect((await hit(r, 'c')).allowed).toBe(true);
    expect((await hit(r, 'c')).allowed).toBe(false);
    await new Promise((res) => setTimeout(res, 1100));
    expect(await hit(r, 'c')).toMatchObject({ allowed: true, count: 1 });
  });

  it('stores only a hash of the identifier', async () => {
    const r = rule('hashed', 5);
    await hit(r, 'user@example.com|203.0.113.9');
    const stored = await row(r, 'user@example.com|203.0.113.9');
    expect(stored?.key).toBe(keyOf(r, 'user@example.com|203.0.113.9'));
    expect(stored?.key).not.toContain('example.com');
    expect(stored?.key).not.toContain('203.0.113.9');
  });
});

describe('hit: concurrency', () => {
  it('increments atomically: N parallel hits produce counts 1..N', async () => {
    const r = rule('parallel', 1000);
    const N = 40;
    const results = await Promise.all(Array.from({ length: N }, () => hit(r, 'burst')));
    const counts = results.map((x) => x.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect((await row(r, 'burst'))?.count).toBe(N);
  });

  it('lets exactly `limit` parallel requests through', async () => {
    const r = rule('parallel-limit', 5);
    const results = await Promise.all(Array.from({ length: 25 }, () => hit(r, 'race')));
    expect(results.filter((x) => x.allowed)).toHaveLength(5);
  });

  it('first hits of a new key race safely (INSERT … ON CONFLICT)', async () => {
    const r = rule('parallel-new', 100);
    const ids = Array.from({ length: 5 }, (_, i) => `new-${i}`);
    await Promise.all(ids.flatMap((id) => Array.from({ length: 6 }, () => hit(r, id))));
    for (const id of ids) expect((await row(r, id))?.count).toBe(6);
  });
});

describe('enforce / reset', () => {
  it('throws HttpError 429 with Retry-After once the limit is exceeded', async () => {
    const r = rule('enforce', 2, 900);
    await enforce(r, 'z');
    await enforce(r, 'z');
    const err = await enforce(r, 'z').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 429 });
    const retryAfter = Number((err as HttpError).headers?.['Retry-After']);
    expect(retryAfter).toBeGreaterThan(890);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it('reset forgets the counter', async () => {
    const r = rule('reset', 1);
    await hit(r, 'q');
    expect((await hit(r, 'q')).allowed).toBe(false);
    await reset(r, 'q');
    expect(await row(r, 'q')).toBeNull();
    expect(await hit(r, 'q')).toMatchObject({ allowed: true, count: 1 });
  });
});
