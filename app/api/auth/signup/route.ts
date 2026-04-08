import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  // --- 入力チェック ---
  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
  }

  // --- 既存チェック ---
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "既に登録済みです" }, { status: 409 });

  // --- ユーザー作成（未認証） ---
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      isEmailVerified: false,
    },
  });

  // --- 確認メール送信API呼び出し ---
  // ★ NEXTAUTH_URL は使わず、「今のリクエストの origin」をそのまま使う
  const base = new URL(req.url).origin;

  await fetch(`${base}/api/account/email/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).catch((e) => {
    console.error("[EMAIL REGISTER CALL ERROR]", e);
  });

  return NextResponse.json({ ok: true, verifyRequired: true });
}
