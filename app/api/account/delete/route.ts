// app/api/account/delete/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clearSessionCookie, jsonError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { passwordInputSchema, verifyPassword } from '@/lib/password';
import { enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { tombstoneEmail } from '@/lib/users';
import { normalizeEmail } from '@/lib/validation';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string({ error: 'メールアドレスとパスワードを入力してください。' }).min(1, 'メールアドレスとパスワードを入力してください。').max(254),
  password: passwordInputSchema,
});

const INVALID = 'メールアドレスまたはパスワードに誤りがあります。';

export const POST = withAuth(async (req, { session }) => {
  const { email, password } = await readJson(req, bodySchema);
  await enforce(RATE_LIMITS.accountPassword, session.userId);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, password: true, isDeleted: true },
  });

  const passwordOk = await verifyPassword(password, user?.password);
  if (!user || user.isDeleted || normalizeEmail(email) !== normalizeEmail(user.email) || !passwordOk) {
    return jsonError(400, INVALID);
  }

  // 論理削除（データは保持）しつつ、個人情報は削除/置換する
  // - email は tombstone に置き換え、同じアドレスで再登録できるようにする
  // - sessionVersion を上げて全端末のセッションを失効
  // - プロフィール（氏名・住所・電話番号など）と未使用の確認トークンを削除
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        email: tombstoneEmail(user.id),
        password: '!deleted',
        isEmailVerified: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.userProfile.deleteMany({ where: { userId: user.id } }),
    prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
  ]);

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
