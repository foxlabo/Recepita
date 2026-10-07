// app/api/account/email/request/route.ts
// メールアドレス変更の申請（ログイン必須）。新アドレス宛に確認リンクを送る。
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, UnauthorizedError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { passwordInputSchema, verifyPassword } from '@/lib/password';
import { enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { findUserByEmail } from '@/lib/users';
import { emailSchema, normalizeEmail } from '@/lib/validation';
import { sendEmailChangeConfirmation } from '@/lib/verification';

export const runtime = 'nodejs';

const bodySchema = z.object({
  newEmail: emailSchema,
  currentPassword: passwordInputSchema,
});

export const POST = withAuth(async (req, { session }) => {
  const { newEmail, currentPassword } = await readJson(req, bodySchema);
  await enforce(RATE_LIMITS.accountPassword, session.userId);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, password: true },
  });
  if (!user) throw new UnauthorizedError();

  if (!(await verifyPassword(currentPassword, user.password))) {
    return jsonError(400, '現在のパスワードが正しくありません。');
  }
  if (newEmail === normalizeEmail(user.email)) {
    return jsonError(400, '現在と同じメールアドレスです。');
  }
  if (await findUserByEmail(newEmail)) {
    return jsonError(409, 'このメールアドレスは使用できません。');
  }

  await enforce(RATE_LIMITS.verificationMailEmail, newEmail);
  try {
    await sendEmailChangeConfirmation(user.id, newEmail);
  } catch (e) {
    console.error('[email change] mail failed:', e instanceof Error ? e.message : e);
    return jsonError(503, '確認メールの送信に失敗しました。時間をおいて再度お試しください。');
  }

  return NextResponse.json({ ok: true });
});
