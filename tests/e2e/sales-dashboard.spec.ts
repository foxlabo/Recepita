import { expect, type Page, test } from '@playwright/test';
import { insertExpense, insertSale, resetUserData } from './db';
import { loginViaApi, previousMonthJst, todayJst } from './helpers';
import { USERS } from './users';

/** Summary card of the dashboard ("今月の売上" etc.). */
const card = (page: Page, label: string) =>
  page.locator('.shadow-card').filter({ has: page.getByText(label, { exact: true }) });

test.beforeEach(async ({ page }) => {
  await resetUserData(USERS.sales);
  const today = todayJst();
  const lastMonth = previousMonthJst();
  // this month: one expense; last month: data that must not count for this month
  await insertExpense(USERS.sales, { ymd: today, amount: 1500, vendor: 'E2E交通', category: '旅費交通費' });
  await insertExpense(USERS.sales, { ymd: lastMonth, amount: 900, vendor: 'E2E先月経費' });
  await insertSale(USERS.sales, { ymd: lastMonth, amount: 50_000, client: 'E2E先月売上' });
  await loginViaApi(page, USERS.sales);
});

test('a sale added on 売上登録 shows up in the dashboard totals of the current JST month', async ({ page }) => {
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: '売上' })).toBeVisible();
  await expect(page.getByLabel('発行日')).toHaveValue(todayJst());

  await page.getByLabel('売上名').fill('E2E案件');
  await page.getByLabel('金額').fill('12,345');
  await page.getByRole('button', { name: '追加' }).click();

  const saleRow = page.getByRole('row', { name: /E2E案件/ });
  await expect(saleRow).toContainText('¥12,345');
  await expect(saleRow).toContainText(todayJst().replace(/-/g, '/'));
  await expect(page.getByLabel('売上名')).toHaveValue(''); // form reset after saving

  await page.getByRole('link', { name: 'ダッシュボード' }).click();
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  await expect(card(page, '今月の売上')).toContainText('¥12,345');
  await expect(card(page, '今月の経費')).toContainText('¥1,500');
  await expect(card(page, '今月の利益')).toContainText('¥10,845');
  // vs. last month: sales 50,000 → 12,345 (-75%), expenses 900 → 1,500 (+67%)
  await expect(card(page, '今月の売上')).toContainText('-75%');
  await expect(card(page, '今月の経費')).toContainText('+67%');
  await expect(page.getByText('先月より売上が20%以上減少しています。')).toBeVisible();

  const recentSales = page.locator('.shadow-card').filter({ hasText: '直近の売上（5件）' });
  await expect(recentSales.getByRole('row', { name: /E2E案件/ })).toContainText('¥12,345');
  const byCategory = page.locator('.shadow-card').filter({ hasText: 'カテゴリ別（今月）' });
  await expect(byCategory).toContainText('旅費交通費');
});

test('rejects a sale without an amount', async ({ page }) => {
  await page.goto('/invoices');
  await page.getByLabel('売上名').fill('E2E金額なし');
  await page.getByRole('button', { name: '追加' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('売上名と金額を入力してください。');
  await expect(page.getByRole('row', { name: /E2E金額なし/ })).toHaveCount(0);
});
