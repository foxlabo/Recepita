// app/api/account/email/request/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import bcrypt from "bcryptjs";
import { EmailClient } from "@azure/communication-email";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1) セッション（現在のログインユーザー）
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 2) 入力（フロントの実装に合わせる）
    const { newEmail, currentPassword } = await req.json().catch(() => ({}));
    if (!newEmail || !currentPassword) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    // 3) 現在ユーザー取得 & パスワード検証
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return NextResponse.json({ error: "password invalid" }, { status: 400 });

    // 4) newEmail の重複／同一チェック
    if (newEmail === user.email) {
      return NextResponse.json({ error: "same email" }, { status: 400 });
    }
    const exists = await prisma.user.findUnique({ where: { email: newEmail } });
    if (exists) return NextResponse.json({ error: "email exists" }, { status: 409 });

    // 5) 古い検証トークン掃除（このユーザー分）
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });

    // 6) トークン発行（30分）
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await prisma.verificationToken.create({
      data: { token, email: newEmail, userId: user.id, expiresAt },
    });

    // 7) 確認メール送信（ACS）
    const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
    const verifyUrl = `${baseUrl}/api/account/email/confirm?token=${encodeURIComponent(token)}`;

    const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    const sender = process.env.AZURE_COMMUNICATION_SENDER;
    if (!conn || !sender) {
      return NextResponse.json({ error: "mail config missing" }, { status: 500 });
    }

    const client = new EmailClient(conn);
    const poller = await client.beginSend({
      senderAddress: sender,
      content: {
        subject: "Recepita メール認証",
        html: `<p>以下のリンクをクリックしてメールアドレスを確認してください（30分有効）:</p>
               <p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      },
      recipients: { to: [{ address: newEmail }] },
    });
    const res = await poller.pollUntilDone();
    if (res.status !== "Succeeded") {
      throw new Error(res.error?.message ?? `ACS status: ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[EMAIL REQUEST ERROR]", e?.message ?? e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
