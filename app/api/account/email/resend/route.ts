// app/api/account/email/resend/route.ts
// 確認メールの再送（未ログインで利用）。アカウントの有無・状態に関わらず
// 同じレスポンスを返す（メールアドレスの存在を推測させない）。
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { showDevVerificationLink } from '@/lib/app-url';
import { readJson, withErrors } from '@/lib/http';
import { clientIp, enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { findUserByEmail } from '@/lib/users';
import { emailSchema } from '@/lib/validation';
import { sendSignupVerification } from '@/lib/verification';

export const runtime = 'nodejs';

const bodySchema = z.object({ email: emailSchema });

async function resend(email: string): Promise<string | undefined> {
  const user = await findUserByEmail(email);
  if (!user || user.isDeleted || user.isEmailVerified) return undefined;
  return sendSignupVerification(user);
}

export const POST = withErrors(async (req) => {
  const { email } = await readJson(req, bodySchema);

  // IP あたり・アドレスあたりの送信回数を制限（アドレスの有無に関係なく数える）
  await enforce(RATE_LIMITS.verificationMailIp, clientIp(req));
  await enforce(RATE_LIMITS.verificationMailEmail, email);

  if (showDevVerificationLink()) {
    // ローカル開発専用: リンクをレスポンスに含める
    const link = await resend(email).catch((e) => {
      console.error('[email resend] failed:', e instanceof Error ? e.message : e);
      return undefined;
    });
    return NextResponse.json({ ok: true, ...(link ? { verificationUrl: link, devMode: true } : {}) });
  }

  // 本番: 検索・送信はレスポンス送信後に行い、処理時間からも存在が分からないようにする
  after(async () => {
    try {
      await resend(email);
    } catch (e) {
      console.error('[email resend] failed:', e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.json({ ok: true });
});
