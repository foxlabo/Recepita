// app/api/auth/signup/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { showDevVerificationLink } from '@/lib/app-url';
import { jsonError, readJson, withErrors } from '@/lib/http';
import { hashPassword, newPasswordSchema } from '@/lib/password';
import { clientIp, enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { findUserByEmail, tombstoneEmail } from '@/lib/users';
import { emailSchema } from '@/lib/validation';
import { sendAlreadyRegisteredNotice, sendSignupVerification } from '@/lib/verification';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Same body whether or not the address was already registered. */
function accepted(devLink?: string) {
  return NextResponse.json({
    ok: true,
    verifyRequired: true,
    ...(devLink && showDevVerificationLink() ? { verificationUrl: devLink, devMode: true } : {}),
  });
}

export const POST = withErrors(async (req) => {
  const { email, password } = await readJson(req, bodySchema);

  // IP あたりの登録数と、同一アドレスへの確認メール送信数を制限
  await enforce(RATE_LIMITS.signup, clientIp(req));
  await enforce(RATE_LIMITS.verificationMailEmail, email);

  // 既存アドレスでも必ずハッシュ計算を行い、処理時間で登録有無が分からないようにする
  const passwordHash = await hashPassword(password);

  const existing = await findUserByEmail(email);
  if (existing && !existing.isDeleted) {
    // 登録済み: 認証済みなら案内メール、未認証なら確認メールを再送（パスワードは変更しない）
    let devLink: string | undefined;
    try {
      if (existing.isEmailVerified) await sendAlreadyRegisteredNotice(existing.email);
      else devLink = await sendSignupVerification(existing);
    } catch (e) {
      console.error('[signup] mail to existing account failed:', errMessage(e));
    }
    return accepted(devLink);
  }
  if (existing?.isDeleted) {
    // 旧仕様で論理削除されたアカウントがアドレスを保持している場合は解放する
    await prisma.user.update({ where: { id: existing.id }, data: { email: tombstoneEmail(existing.id) } });
  }

  let user: { id: string; email: string };
  try {
    user = await prisma.user.create({
      data: { email, password: passwordHash, isEmailVerified: false },
      select: { id: true, email: true },
    });
  } catch (e) {
    // 同時登録などで一意制約に当たった場合も同じ応答にする
    if ((e as { code?: unknown })?.code === 'P2002') return accepted();
    throw e;
  }

  try {
    // 自サーバーへの fetch ではなく共通関数を直接呼ぶ（Host ヘッダー由来の SSRF を防ぐ）
    const devLink = await sendSignupVerification(user);
    return accepted(devLink);
  } catch (e) {
    console.error('[signup] verification mail failed:', errMessage(e));
    // 確認メールを送れなかった登録は取り消す（トークンは外部キーで連鎖削除）
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    return jsonError(503, '確認メールの送信に失敗しました。時間をおいて再度お試しください。');
  }
});
