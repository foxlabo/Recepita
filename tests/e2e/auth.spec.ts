import { expect, test } from '@playwright/test';
import { loginViaForm } from './helpers';
import { UNKNOWN_EMAIL, USERS } from './users';

test.describe('authentication', () => {
  test('unauthenticated access redirects to /login?next=…', async ({ page }) => {
    await page.goto('/receipts?year=2026&month=9');
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/receipts?year=2026&month=9');
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();

    // protected APIs answer 401 JSON instead of redirecting
    const api = await page.request.get('/api/dashboard/summary');
    expect(api.status()).toBe(401);
    expect(await api.json()).toEqual({ error: 'unauthorized' });
  });

  test('wrong password shows the generic error and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await loginViaForm(page, USERS.auth, 'definitely-wrong-password');
    await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // the same message for an account that does not exist
    const [res] = await Promise.all([
      page.waitForResponse('**/api/auth/login'),
      loginViaForm(page, UNKNOWN_EMAIL, 'definitely-wrong-password'),
    ]);
    expect(res.status()).toBe(401);
    await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === 'recepita_session')).toBe(false);
  });

  test('successful login opens the dashboard', async ({ page }) => {
    await page.goto('/login');
    await loginViaForm(page, USERS.auth);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByText(USERS.auth)).toBeVisible();

    const session = (await page.context().cookies()).find((c) => c.name === 'recepita_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
  });

  test('login returns to the page that was requested', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page).toHaveURL(/\/login\?next=%2Finvoices$/);
    await loginViaForm(page, USERS.auth);
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByRole('heading', { name: '売上' })).toBeVisible();
  });

  test('?next= cannot redirect to another site', async ({ page }) => {
    await page.goto('/login?next=%2F..%2F%2Fevil.example');
    await loginViaForm(page, USERS.auth);
    await expect(page).toHaveURL(/localhost:4450\/dashboard$/);
  });

  test('logout ends the session; protected pages redirect again', async ({ page }) => {
    await page.goto('/login');
    await loginViaForm(page, USERS.auth);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'サインアウト' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).some((c) => c.name === 'recepita_session' && c.value)).toBe(false);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
