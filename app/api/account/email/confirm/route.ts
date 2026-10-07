// app/api/account/email/confirm/route.ts
// メールアドレス変更の確定: GET /api/account/email/confirm?token=xxxx
import type { NextRequest } from 'next/server';
import { clearedSessionCookie } from '@/lib/auth-server';
import { relativeRedirect } from '@/lib/http';
import { consumeToken, TokenRejected } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const result = await consumeToken(req.nextUrl.searchParams.get('token'), 'EMAIL_CHANGE', async (tx, vt) => {
      // メール更新＋認証済みに。sessionVersion を上げて全端末のセッションを失効。
      // 新アドレスが既に使われていれば一意制約違反 → 'taken'
      const { count } = await tx.user.updateMany({
        where: { id: vt.userId, isDeleted: false },
        data: { email: vt.email, isEmailVerified: true, sessionVersion: { increment: 1 } },
      });
      if (count !== 1) throw new TokenRejected('invalid');
    });

    if (!result.ok) return relativeRedirect(`/login?email_changed=0&reason=${result.reason}`);

    // このブラウザの Cookie も消してログイン画面へ
    const res = relativeRedirect('/login?email_changed=1');
    res.cookies.set(clearedSessionCookie());
    return res;
  } catch (e) {
    console.error('[email confirm] failed:', e instanceof Error ? e.message : e);
    return relativeRedirect('/login?email_changed=0&reason=error');
  }
}
