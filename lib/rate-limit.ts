// lib/rate-limit.ts
// Small DB-backed fixed-window rate limiter (works across instances).
// One atomic INSERT ... ON CONFLICT DO UPDATE per hit; counters live in the
// RateLimit table under "<rule>:<sha256(identifier)>".
import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { HttpError } from '@/lib/http';

export type RateLimitRule = { name: string; limit: number; windowSec: number };

export const RATE_LIMITS = {
  /** Login attempts per client IP + e-mail (reset on success). */
  login: { name: 'login:ip-email', limit: 5, windowSec: 15 * 60 },
  /** Account creations per client IP. */
  signup: { name: 'signup:ip', limit: 10, windowSec: 60 * 60 },
  /** Verification e-mails per client IP. */
  verificationMailIp: { name: 'verify-mail:ip', limit: 10, windowSec: 60 * 60 },
  /** Verification e-mails per address. */
  verificationMailEmail: { name: 'verify-mail:email', limit: 3, windowSec: 15 * 60 },
  /** Password-confirmed account actions (password/e-mail change, deletion) per user. */
  accountPassword: { name: 'account-password:user', limit: 10, windowSec: 15 * 60 },
  /** OCR requests per user (burst and daily cap; each call costs money). */
  ocrMinute: { name: 'ocr:user:1m', limit: 30, windowSec: 60 },
  ocrDay: { name: 'ocr:user:1d', limit: 500, windowSec: 24 * 60 * 60 },
} satisfies Record<string, RateLimitRule>;

export const RATE_LIMIT_MESSAGE = 'リクエストが多すぎます。しばらく時間をおいてから再度お試しください。';

const MAX_WINDOW_SEC = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowSec));

function keyFor(rule: RateLimitRule, identifier: string): string {
  return `${rule.name}:${createHash('sha256').update(identifier, 'utf8').digest('hex')}`;
}

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSec: number };

/** Count one hit for `identifier` under `rule`. */
export async function hit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const key = keyFor(rule, identifier);
  const windowSec = rule.windowSec;
  // All SET expressions see the old row, so both CASEs agree on whether the
  // window expired. Times are UTC "timestamp without time zone" like Prisma's.
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date; now: Date }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, (now() AT TIME ZONE 'UTC'), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= (now() AT TIME ZONE 'UTC') - (${windowSec}::int * interval '1 second')
        THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= (now() AT TIME ZONE 'UTC') - (${windowSec}::int * interval '1 second')
        THEN (now() AT TIME ZONE 'UTC') ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart", (now() AT TIME ZONE 'UTC') AS "now"`;

  maybeCleanup();

  const row = rows[0];
  const count = Number(row.count);
  const elapsedMs = new Date(row.now).getTime() - new Date(row.windowStart).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((windowSec * 1000 - elapsedMs) / 1000));
  return { allowed: count <= rule.limit, count, retryAfterSec };
}

/** Count a hit and throw HttpError(429) with Retry-After when over the limit. */
export async function enforce(rule: RateLimitRule, identifier: string): Promise<void> {
  const r = await hit(rule, identifier);
  if (!r.allowed) {
    throw new HttpError(429, RATE_LIMIT_MESSAGE, { 'Retry-After': String(r.retryAfterSec) });
  }
}

/** Forget the counter (e.g. after a successful login). */
export async function reset(rule: RateLimitRule, identifier: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: keyFor(rule, identifier) } });
}

/** Occasionally drop counters older than the longest window. */
function maybeCleanup() {
  if (Math.random() > 0.02) return;
  const cutoff = new Date(Date.now() - MAX_WINDOW_SEC * 1000);
  prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => {});
}

/**
 * Client IP: first entry of X-Forwarded-For (set by the reverse proxy /
 * Next's server), then X-Real-IP. Ports ("1.2.3.4:5678" as sent by Azure App
 * Service, "[::1]:443") are stripped.
 */
export function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const raw = first || req.headers.get('x-real-ip')?.trim() || '';
  const v4 = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1];
  const v6 = raw.match(/^\[([0-9a-fA-F:.]+)\](?::\d+)?$/);
  if (v6) return v6[1];
  return raw.slice(0, 64) || 'unknown';
}
