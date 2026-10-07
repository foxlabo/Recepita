// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { startSession } from '@/lib/auth-server';
import { jsonError, readJson, withErrors } from '@/lib/http';
import { hashPassword, needsRehash, passwordInputSchema, verifyPassword } from '@/lib/password';
import { clientIp, enforce, RATE_LIMITS, reset } from '@/lib/rate-limit';
import { findUserByEmail } from '@/lib/users';
import { emailSchema } from '@/lib/validation';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: emailSchema,
  password: passwordInputSchema,
});

// 存在しない・パスワード違い・未認証・削除済みのいずれも同じ応答にする
const INVALID_CREDENTIALS = 'メールアドレスまたはパスワードが違います';

export const POST = withErrors(async (req) => {
  const { email, password } = await readJson(req, bodySchema);

  // 同一 IP + メールアドレスあたりの試行回数を制限（成功時にリセット）
  const limiterId = `${clientIp(req)}|${email}`;
  await enforce(RATE_LIMITS.login, limiterId);

  const user = await findUserByEmail(email);
  // ユーザーがいない場合もダミーハッシュと比較して処理時間を揃える
  const passwordOk = await verifyPassword(password, user?.password);

  if (!user || !passwordOk || user.isDeleted || !user.isEmailVerified) {
    return jsonError(401, INVALID_CREDENTIALS);
  }

  // 旧コスト(10)のハッシュはログイン成功時に現行コストで再ハッシュ
  if (needsRehash(user.password)) {
    try {
      await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
    } catch (e) {
      console.warn('[login] rehash failed:', e instanceof Error ? e.message : e);
    }
  }

  await reset(RATE_LIMITS.login, limiterId).catch(() => {});
  await startSession(user); // JWT に sessionVersion (sv) を含めて Cookie に保存
  return NextResponse.json({ ok: true });
});
