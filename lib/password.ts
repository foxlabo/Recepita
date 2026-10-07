// lib/password.ts
import 'server-only';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

/** Cost for newly created hashes. Older cost-10 hashes still verify. */
export const BCRYPT_COST = 12;

/** Policy for new passwords (signup / password change). */
export const newPasswordSchema = z
  .string({ error: 'パスワードを入力してください。' })
  .min(8, 'パスワードは8文字以上で入力してください。')
  // bcrypt only uses the first 72 bytes; reject instead of silently truncating.
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'パスワードが長すぎます（72バイト以内で入力してください）。');

/** Loose schema for passwords being checked (login, confirmations). */
export const passwordInputSchema = z
  .string({ error: 'パスワードを入力してください。' })
  .min(1, 'パスワードを入力してください。')
  .max(256, 'パスワードが長すぎます。');

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);
  return dummyHash;
}

/**
 * Compare a password with a stored hash. When there is no usable hash (e.g.
 * unknown user) a dummy hash is compared instead so the response time does
 * not reveal whether the account exists. Never throws.
 */
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  const usable = typeof hash === 'string' && hash.startsWith('$2');
  try {
    const ok = await bcrypt.compare(plain, usable ? hash : await getDummyHash());
    return usable && ok;
  } catch {
    return false;
  }
}

/** True when the stored hash uses a lower cost than BCRYPT_COST. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
}
