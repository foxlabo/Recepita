// Direct SQL access to the E2E database (seeding and per-test resets).
// Plain `pg` instead of the app's Prisma client: lib/prisma.ts is server-only
// and the generated client is ESM-only, while Playwright loads tests as CJS.
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { testDatabaseUrl } from '../support/test-db';

/** Every E2E account lives under this domain; nothing else is ever touched. */
export const E2E_DOMAIN = 'e2e.example.test';

/** Test-only credentials (also documented in tests/e2e/users.ts). */
export const E2E_PASSWORD = 'e2e-Password-2026';

export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Remove all E2E accounts (their expenses, drafts, sales … cascade) and their login rate-limit rows. */
export async function deleteE2eUsers(db: pg.Client, emails: readonly string[]): Promise<void> {
  await db.query(`DELETE FROM "User" WHERE email LIKE $1`, [`%@${E2E_DOMAIN}`]);
  // lib/rate-limit.ts keys: "login:ip-email:<sha256(ip|email)>"; the server sees the loopback address
  const ips = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown'];
  const keys = emails.flatMap((email) =>
    ips.map((ip) => `login:ip-email:${createHash('sha256').update(`${ip}|${email}`).digest('hex')}`),
  );
  await db.query(`DELETE FROM "RateLimit" WHERE key = ANY($1)`, [keys]);
}

export async function createVerifiedUser(db: pg.Client, email: string, passwordHash: string): Promise<string> {
  const id = `e2e_${randomUUID()}`;
  await db.query(
    `INSERT INTO "User" (id, email, password, "isEmailVerified", "sessionVersion", "isDeleted")
     VALUES ($1, $2, $3, true, 0, false)`,
    [id, email, passwordHash],
  );
  return id;
}

export function hashE2ePassword(): Promise<string> {
  return bcrypt.hash(E2E_PASSWORD, 12);
}

async function userId(db: pg.Client, email: string): Promise<string> {
  const r = await db.query<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [email]);
  if (!r.rows[0]) throw new Error(`E2E user ${email} is missing: did the global setup (seed) run?`);
  return r.rows[0].id;
}

/** Delete the user's expenses, drafts and sales so a test (or its retry) starts from a clean slate. */
export async function resetUserData(email: string): Promise<void> {
  await withDb(async (db) => {
    const id = await userId(db, email);
    await db.query(`DELETE FROM "Expense" WHERE "userId" = $1`, [id]);
    await db.query(`DELETE FROM "DraftExpense" WHERE "userId" = $1`, [id]);
    await db.query(`DELETE FROM "Invoice" WHERE "userId" = $1`, [id]);
  });
}

/** Insert an expense dated on the calendar day `ymd` (stored as 00:00 UTC, like the app). */
export async function insertExpense(
  email: string,
  e: { ymd: string; amount: number; vendor: string; category?: string },
) {
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "Expense" (id, "userId", date, amount, vendor, category, "createdAt", "updatedAt")
       VALUES ($1, $2, $3::date, $4, $5, $6, now(), now())`,
      [`e2e_${randomUUID()}`, await userId(db, email), e.ymd, e.amount, e.vendor, e.category ?? null],
    );
  });
}

/** Insert a sale (Invoice) issued on the calendar day `ymd`. */
export async function insertSale(email: string, s: { ymd: string; amount: number; client: string }) {
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO "Invoice" (id, "userId", "issueDate", amount, client, "createdAt", "updatedAt")
       VALUES ($1, $2, $3::date, $4, $5, now(), now())`,
      [`e2e_${randomUUID()}`, await userId(db, email), s.ymd, s.amount, s.client],
    );
  });
}

/** Amount column of the user's expenses, newest first. */
export async function expenseAmounts(email: string): Promise<number[]> {
  return withDb(async (db) => {
    const r = await db.query<{ amount: number }>(
      `SELECT amount FROM "Expense" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
      [await userId(db, email)],
    );
    return r.rows.map((x) => x.amount);
  });
}
