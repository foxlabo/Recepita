// app/api/account/email/request/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, UnauthorizedError, withAuth } from "@/lib/auth-server";
import bcrypt from "bcryptjs";
import { EmailClient } from "@azure/communication-email";
import crypto from "crypto";

export const runtime = "nodejs";

export const POST = withAuth(async (req, { session }) => {
  // 入力（フロントの実装に合わせる）
  const { newEmail, currentPassword } = await req.json().catch(() => ({}));
  if (!newEmail || !currentPassword) {
    return jsonError(400, "bad request");
  }

  // 現在ユーザー取得 & パスワード検証
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new UnauthorizedError();

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return jsonError(400, "password invalid");

  // newEmail の重複／同一チェック
  if (newEmail === user.email) {
    return jsonError(400, "same email");
  }
  const exists = await prisma.user.findUnique({ where: { email: newEmail } });
  if (exists) return jsonError(409, "email exists");

  // 古い検証トークン掃除（このユーザー分）
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });

  // トークン発行（30分）
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
  await prisma.verificationToken.create({
    data: { token, email: newEmail, userId: user.id, expiresAt },
  });

  // 確認メール送信（ACS）
  const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const verifyUrl = `${baseUrl}/api/account/email/confirm?token=${encodeURIComponent(token)}`;

  const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const sender = process.env.AZURE_COMMUNICATION_SENDER;
  if (!conn || !sender) {
    return jsonError(500, "送信に失敗しました");
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
    throw new Error(`ACS status: ${res.status}`);
  }

  return NextResponse.json({ ok: true });
});
