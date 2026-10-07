import { expect, test } from '@playwright/test';
import { loginViaApi } from './helpers';
import { USERS } from './users';

test('the dark-mode toggle persists across reloads', async ({ page }) => {
  await loginViaApi(page, USERS.theme);
  await page.goto('/dashboard');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /クリックで切り替え/ });

  // colorScheme is "light" (playwright.config.ts) and nothing is stored yet
  await expect(html).not.toHaveClass(/\bdark\b/);
  await expect(toggle).toContainText('ライト');

  await toggle.click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(toggle).toContainText('ダーク');
  expect(await page.evaluate(() => localStorage.getItem('rx_theme'))).toBe('dark');

  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/);
  await page.goto('/receipts');
  await expect(html).toHaveClass(/\bdark\b/);

  await page.getByRole('button', { name: /クリックで切り替え/ }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => localStorage.getItem('rx_theme'))).toBe('light');
});

test('without a stored choice the OS setting is used, and a stored choice wins over it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginViaApi(page, USERS.theme);
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.evaluate(() => localStorage.setItem('rx_theme', 'light'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});

test('the theme is applied before hydration (no light flash)', async ({ page }) => {
  await loginViaApi(page, USERS.theme);
  await page.addInitScript(() => localStorage.setItem('rx_theme', 'dark'));
  // Inspect the DOM as soon as it is parsed, before any client JavaScript runs.
  await page.route('**/_next/static/**/*.js', (route) => route.abort());
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});
