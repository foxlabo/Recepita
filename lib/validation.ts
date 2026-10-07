// lib/validation.ts
import { z } from 'zod';
import { parseDateInput, parseDateOnly } from '@/lib/dates';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trimmed, lower-cased e-mail address. */
export const emailSchema = z
  .string({ error: 'メールアドレスを入力してください。' })
  .trim()
  .toLowerCase()
  .min(1, 'メールアドレスを入力してください。')
  .max(254, 'メールアドレスが長すぎます。')
  .pipe(z.email({ error: 'メールアドレスの形式が正しくありません。' }));

/** Database id (cuid / uuid). */
export const idSchema = z.string({ error: 'IDが正しくありません。' }).min(1).max(64);

/** Non-empty list of ids, capped to keep queries bounded. */
export const idListSchema = z
  .array(idSchema, { error: 'IDの一覧が正しくありません。' })
  .min(1, '対象が選択されていません。')
  .max(1000, '一度に処理できる件数を超えています。');

/**
 * Calendar date ('YYYY-MM-DD', also 2026/9/30 etc.) → 00:00 UTC of that date;
 * ISO date-time / epoch millis → that instant. See lib/dates.ts.
 */
export const dateInputSchema = z
  .union([z.string().max(64), z.number()], { error: '日付が正しくありません。' })
  .transform((v, ctx) => {
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: 'custom', message: '日付が正しくありません。' });
      return z.NEVER;
    }
    return d;
  });

/**
 * Required calendar date ('YYYY-MM-DD'; 2026/9/30 and 2026年9月30日 are
 * normalised) → Date at 00:00 UTC of that date. `label` names the field in
 * the Japanese error messages.
 */
export const dateOnlySchema = (label = '日付') =>
  z
    .string({ error: `${label}を入力してください。` })
    .trim()
    .min(1, `${label}を入力してください。`)
    .max(64, `${label}が正しくありません。`)
    .transform((v, ctx) => {
      const d = parseDateOnly(v);
      if (!d) {
        ctx.addIssue({ code: 'custom', message: `${label}はYYYY-MM-DD形式の正しい日付で入力してください。` });
        return z.NEVER;
      }
      return d;
    });

/** Integer that fits a PostgreSQL INTEGER column. */
export const int32Schema = z
  .number({ error: '数値が正しくありません。' })
  .int('整数で入力してください。')
  .min(-2_147_483_648, '数値が大きすぎます。')
  .max(2_147_483_647, '数値が大きすぎます。');

/** Optional free text with a length cap (undefined / null pass through). */
export const optionalText = (max: number) =>
  z.string({ error: '文字列で入力してください。' }).max(max, `${max}文字以内で入力してください。`).nullish();

/** Structured expense items accepted by /api/expenses (stored as ExpenseItem rows). */
export const expenseItemsSchema = z
  .array(
    z.object({
      name: optionalText(500),
      qty: z.number().max(1_000_000).nullish(),
      price: z.number().max(2_147_483_647).min(-2_147_483_648).nullish(),
      total: z.number().max(2_147_483_647).min(-2_147_483_648).nullish(),
    }),
    { error: '品目の形式が正しくありません。' },
  )
  .max(500, '品目が多すぎます。');
