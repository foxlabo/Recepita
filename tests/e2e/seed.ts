// Seeds the E2E database: removes every account under @e2e.example.test
// (with all their data) and recreates the verified test users.
// Runs as Playwright's global setup (see playwright.config.ts).
import { createVerifiedUser, deleteE2eUsers, hashE2ePassword, withDb } from './db';
import { UNKNOWN_EMAIL, USERS } from './users';

export async function seed(): Promise<void> {
  const hash = await hashE2ePassword();
  await withDb(async (db) => {
    await db.query('BEGIN');
    try {
      await deleteE2eUsers(db, [...Object.values(USERS), UNKNOWN_EMAIL]);
      for (const email of Object.values(USERS)) await createVerifiedUser(db, email, hash);
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  });
}
