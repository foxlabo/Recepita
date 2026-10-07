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
