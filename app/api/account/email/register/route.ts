// app/api/account/email/register/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EmailClient } from "@azure/communication-email";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    // 1) 直前のサインアップで作られたユーザーを取得
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // まだユーザーが作られていない／メールアドレスが不正
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // 2) 既存トークン掃除（任意）
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });

    // 3) トークン作成（userId を必ず付与）
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await prisma.verificationToken.create({
      data: { token, email, userId: user.id, expiresAt },
    });

    // 4) 認証リンク生成
    const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
    const verifyUrl = `${baseUrl}/api/account/email/verify?token=${encodeURIComponent(token)}`;

    // 5) 送信
    const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING!;
    const sender = process.env.AZURE_COMMUNICATION_SENDER!;
    const client = new EmailClient(conn);

    const poller = await client.beginSend({
      senderAddress: sender,
      content: {
        subject: "Recepita 新規登録メール認証",
        html: `<p>以下のリンクをクリックしてアカウント登録を完了してください（30分有効）:</p>
               <p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      },
      recipients: { to: [{ address: email }] },
    });

    const res = await poller.pollUntilDone();
    if (res.status !== "Succeeded") {
      throw new Error(res.error?.message ?? `ACS status: ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[EMAIL REGISTER ERROR]", e?.message ?? e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
