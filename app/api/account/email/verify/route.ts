// app/api/account/email/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// サインアップ有効化: GET /api/account/email/verify?token=xxxx
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const vt = await prisma.verificationToken.findUnique({ where: { token } });
    if (!vt) {
      return NextResponse.json({ error: "invalid token" }, { status: 400 });
    }

    if (vt.expiresAt && vt.expiresAt.getTime() < Date.now()) {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
      return NextResponse.json({ error: "token expired" }, { status: 400 });
    }

    const user = vt.userId
      ? await prisma.user.findUnique({ where: { id: vt.userId } })
      : await prisma.user.findUnique({ where: { email: vt.email } });

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: vt.email, isEmailVerified: true },
    });

    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

    // ★ ここを修正：NEXT_PUBLIC_APP_URL または NEXTAUTH_URL を優先
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      url.origin;

    const redirectTo = new URL(`/login?verified=1`, base);
    return NextResponse.redirect(redirectTo);
  } catch (e: any) {
    console.error("[EMAIL VERIFY ERROR]", e?.message ?? e);
    return NextResponse.json({ error: "verify failed" }, { status: 500 });
  }
}

// POST でも来たら GET に流す
export async function POST(req: Request) {
  const u = new URL(req.url);
  return GET(new NextRequest(u.toString(), { method: "GET" }));
}
