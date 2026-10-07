// Database used by the integration and E2E tests.
//
// TEST_DATABASE_URL (or, when unset, DATABASE_URL) must name a database whose
// name contains "test", so a misconfigured run can never wipe development or
// production data. Tests only delete rows they created themselves.
//
// No import.meta here: Playwright loads this file as CommonJS.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'Set TEST_DATABASE_URL (or DATABASE_URL) to a PostgreSQL database for tests, ' +
        'e.g. postgresql://user:pass@127.0.0.1:5432/recepita_test',
    );
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL');
  }
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run tests against database "${name}": its name must contain "test".`);
  }
  return raw;
}

/** Apply the Prisma migrations to the test database (idempotent). Run from the repository root. */
export function migrateTestDatabase(url = testDatabaseUrl()): void {
  const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
