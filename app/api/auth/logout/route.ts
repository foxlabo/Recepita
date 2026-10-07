// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth-server';

// この端末のみサインアウト（他端末のセッションは /api/auth/logout-all で失効）
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
