// app/api/account/password/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, startSession, UnauthorizedError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { hashPassword, newPasswordSchema, passwordInputSchema, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

const bodySchema = z.object({
  current: passwordInputSchema,
  next: newPasswordSchema,
});

export const POST = withAuth(async (req, { session }) => {
  const { current, next } = await readJson(req, bodySchema);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, password: true },
  });
  if (!user) throw new UnauthorizedError();

  if (!(await verifyPassword(current, user.password))) {
    return jsonError(400, '現在のパスワードが正しくありません。');
  }

  // パスワード更新と同時に sessionVersion を上げ、他端末のセッションを失効させる
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(next), sessionVersion: { increment: 1 } },
    select: { id: true, email: true, sessionVersion: true },
  });
  // この端末はログイン状態を維持（新しい sessionVersion で再発行）
  await startSession(updated);

  return NextResponse.json({ ok: true });
});
