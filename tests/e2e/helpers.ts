import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './db';

/** Log in through the API (fast path for tests that are not about the login form). */
export async function loginViaApi(page: Page, email: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', { data: { email, password: E2E_PASSWORD } });
  expect(res.status(), await res.text()).toBe(200);
}

/** Log in through the login form. */
export async function loginViaForm(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.getByLabel('メール', { exact: true }).fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
}

/**
 * Accept every alert/confirm and remember its message. The app reports
 * results with alert() and asks with confirm().
 */
export function acceptDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });
  return messages;
}

/** Today's date in JST as YYYY-MM-DD (the app's notion of "today"). */
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** First day of the previous JST month as YYYY-MM-DD. */
export function previousMonthJst(now = new Date()): string {
  const [y, m] = todayJst(now).split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return prev.toISOString().slice(0, 10);
}
