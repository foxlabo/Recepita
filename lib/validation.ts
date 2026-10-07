// lib/validation.ts
import { z } from 'zod';

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

/** 'YYYY-MM-DD' / ISO string / epoch millis → valid Date. */
export const dateInputSchema = z
  .union([z.string().max(64), z.number()], { error: '日付が正しくありません。' })
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), '日付が正しくありません。');

/** Integer that fits a PostgreSQL INTEGER column. */
export const int32Schema = z
  .number({ error: '数値が正しくありません。' })
  .int('整数で入力してください。')
  .min(-2_147_483_648, '数値が大きすぎます。')
  .max(2_147_483_647, '数値が大きすぎます。');

/** Optional free text with a length cap (undefined / null pass through). */
export const optionalText = (max: number) =>
  z.string({ error: '文字列で入力してください。' }).max(max, `${max}文字以内で入力してください。`).nullish();
