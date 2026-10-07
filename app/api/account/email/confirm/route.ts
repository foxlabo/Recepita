// app/api/account/email/confirm/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearedSessionCookie } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXTAUTH_URL || url.origin;
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?email_changed=0&reason=notoken", base));
  }

  const vt = await prisma.verificationToken.findUnique({ where: { token } });
  if (!vt || vt.expiresAt < new Date()) {
    if (vt) await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(new URL("/login?email_changed=0&reason=expired", base));
  }

  // メール更新＋認証フラグON。sessionVersion を上げて全端末のセッションを失効
  await prisma.user.update({
    where: { id: vt.userId },
    data: { email: vt.email, isEmailVerified: true, sessionVersion: { increment: 1 } },
  });

  // トークンは使い切り
  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

  // Cookie を消して /login へリダイレクト
  const res = NextResponse.redirect(new URL("/login?email_changed=1", base));
  res.cookies.set(clearedSessionCookie());
  return res;
}
