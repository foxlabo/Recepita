import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { insertExpense, insertSale, resetUserData } from './db';
import { loginViaApi, previousMonthJst, todayJst } from './helpers';
import { UNKNOWN_EMAIL, USERS } from './users';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Serious/critical WCAG 2 A/AA violations, formatted for a readable failure message. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    }));
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('login page has no serious or critical WCAG 2 A/AA violations', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // also with the error banner shown
      await page.getByLabel('メール', { exact: true }).fill(UNKNOWN_EMAIL);
      await page.getByLabel('パスワード', { exact: true }).fill('wrong-password');
      await page.getByRole('button', { name: 'ログイン' }).click();
      await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test('dashboard has no serious or critical WCAG 2 A/AA violations', async ({ page }) => {
      await resetUserData(USERS.a11y);
      await insertExpense(USERS.a11y, { ymd: todayJst(), amount: 3000, vendor: 'A11y商店', category: '消耗品費' });
      await insertExpense(USERS.a11y, { ymd: previousMonthJst(), amount: 1000, vendor: 'A11y先月' });
      await insertSale(USERS.a11y, { ymd: todayJst(), amount: 8000, client: 'A11y案件' });
      await insertSale(USERS.a11y, { ymd: previousMonthJst(), amount: 9000, client: 'A11y先月案件' });
      await loginViaApi(page, USERS.a11y);

      await page.goto('/dashboard');
      await expect(page.locator('.shadow-card').filter({ hasText: '今月の売上' })).toContainText('¥8,000');
      await expect(page.getByText('読込中…')).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
