import { expect, test } from '@playwright/test';
import { expenseAmounts, resetUserData } from './db';
import { acceptDialogs, loginViaApi, todayJst } from './helpers';
import { USERS } from './users';

test.beforeEach(async ({ page }) => {
  await resetUserData(USERS.expenses);
  await loginViaApi(page, USERS.expenses);
});

test('register an expense draft manually, finalize it, see it in 経費一覧 and edit the amount', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  const today = todayJst();

  // ---- 経費登録: manual draft (no OCR)
  await page.goto('/expenses');
  await expect(page.getByRole('heading', { name: '経費' })).toBeVisible();
  await expect(page.getByText('下書きなし')).toBeVisible();

  await expect(page.getByLabel('取引日')).toHaveValue(today);
  await page.getByLabel('金額').fill('1,200');
  await page.getByLabel('取引先').fill('E2E文具店');
  await page.getByLabel('区分').fill('消耗品費');
  await page.getByLabel('品目').fill('コピー用紙:1,250, 値引き:▲50');
  await page.getByLabel('メモ').fill('E2E テスト');
  await page.getByRole('button', { name: '追加' }).click();

  const draftRow = page.getByRole('row', { name: /E2E文具店/ });
  await expect(draftRow).toBeVisible();
  await expect(draftRow).toContainText('1,200');
  await expect(draftRow).toContainText('消耗品費');
  await expect(draftRow).toContainText('コピー用紙:1250, 値引き:-50');
  await expect(page.getByText('下書きなし')).toHaveCount(0);

  // ---- finalize
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.getByText('下書きなし')).toBeVisible();
  expect(dialogs).toEqual(['1件を登録します。よろしいですか？', '1件を登録しました']);

  // ---- 経費一覧
  await page.getByRole('link', { name: '経費一覧' }).click();
  await expect(page.getByRole('heading', { name: '経費一覧' })).toBeVisible();
  await expect(page.getByText('件数: 1（ページ 1/1）')).toBeVisible();

  // the user's only expense (resetUserData)
  const row = page.locator('tbody tr').first();
  const cells = row.locator('input:not([type="checkbox"])'); // 登録日, 取引日, 金額, 取引先, 区分, 品目, メモ
  await expect(cells).toHaveCount(7);
  await expect(cells.nth(0)).toHaveValue(today);
  await expect(cells.nth(1)).toHaveValue(today);
  const amount = cells.nth(2);
  await expect(amount).toHaveValue('1200');
  await expect(cells.nth(3)).toHaveValue('E2E文具店');
  await expect(cells.nth(4)).toHaveValue('消耗品費');
  await expect(cells.nth(5)).toHaveValue('コピー用紙:1250, 値引き:-50');
  await expect(cells.nth(6)).toHaveValue('E2E テスト');

  // ---- edit the amount
  await amount.fill('1,500');
  await expect(row.getByRole('checkbox', { name: '選択' })).toBeChecked(); // edited rows are selected
  await page.getByRole('button', { name: '一括更新' }).click();
  await expect.poll(() => dialogs.at(-1)).toBe('1件を更新しました');

  await page.reload();
  await expect(page.locator('tbody tr').first().locator('input:not([type="checkbox"])').nth(2)).toHaveValue('1500');
  expect(await expenseAmounts(USERS.expenses)).toEqual([1500]);
});

test('an invalid amount is not saved', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await page.goto('/expenses');
  await page.getByLabel('金額').fill('12abc');
  await page.getByLabel('取引先').fill('E2E不正');
  await page.getByRole('button', { name: '追加' }).click();
  await expect.poll(() => dialogs.at(-1)).toBe('金額は数値で入力してください。');
  await expect(page.getByText('下書きなし')).toBeVisible();
});
