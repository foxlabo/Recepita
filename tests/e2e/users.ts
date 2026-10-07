// E2E accounts. One per spec file, so files can run in parallel without
// sharing data. All are created (verified, password E2E_PASSWORD) by
// tests/e2e/seed.ts before the run.
import { E2E_DOMAIN } from './db';

export const USERS = {
  auth: `auth@${E2E_DOMAIN}`,
  expenses: `expenses@${E2E_DOMAIN}`,
  sales: `sales@${E2E_DOMAIN}`,
  theme: `theme@${E2E_DOMAIN}`,
  a11y: `a11y@${E2E_DOMAIN}`,
} as const;

/** An address without an account (login failures). Its rate-limit counter is reset by the seed. */
export const UNKNOWN_EMAIL = `nobody@${E2E_DOMAIN}`;
