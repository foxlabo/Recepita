// app/api/account/email/verify/route.ts
// サインアップ時のメールアドレス確認: GET /api/account/email/verify?token=xxxx
import type { NextRequest } from 'next/server';
import { relativeRedirect } from '@/lib/http';
import { consumeToken, TokenRejected } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const result = await consumeToken(req.nextUrl.searchParams.get('token'), 'EMAIL_VERIFY', async (tx, vt) => {
      // トークン発行時のアドレスのまま、かつ削除されていないユーザーのみ有効化
      const { count } = await tx.user.updateMany({
        where: { id: vt.userId, email: vt.email, isDeleted: false },
        data: { isEmailVerified: true },
      });
      if (count !== 1) throw new TokenRejected('invalid');
    });
    return relativeRedirect(result.ok ? '/login?verified=1' : `/login?verified=0&reason=${result.reason}`);
  } catch (e) {
    console.error('[email verify] failed:', e instanceof Error ? e.message : e);
    return relativeRedirect('/login?verified=0&reason=error');
  }
}
