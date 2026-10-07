// app/api/auth/logout-all/route.ts
import { NextResponse } from 'next/server';
import { bumpSessionVersion, clearSessionCookie, withAuth } from '@/lib/auth-server';

export const runtime = 'nodejs';

// 全端末サインアウト: sessionVersion を上げて発行済みの JWT をすべて失効させる
export const POST = withAuth(async (_req, { session }) => {
  await bumpSessionVersion(session.userId);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
