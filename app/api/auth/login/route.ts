// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { startSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const user = await prisma.user.findUnique({ where: { email } });

  // ★ 削除済みもログイン不可
  if (!user || user.isDeleted) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードに誤りがあります。" },
      { status: 401 }
    );
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードに誤りがあります。" },
      { status: 401 }
    );
  }

  if (!user.isEmailVerified) {
    return NextResponse.json(
      { error: "メール認証が完了していません", code: "EMAIL_NOT_VERIFIED" },
      { status: 403 }
    );
  }

  await startSession(user); // JWT に sessionVersion (sv) を含めて Cookie に保存

  return NextResponse.json({ ok: true });
}
