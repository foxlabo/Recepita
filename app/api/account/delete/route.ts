// app/api/account/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSessionOrThrow, clearSessionCookie } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ログイン必須
    const session = await getSessionOrThrow();

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    /// セッションのユーザーを取得
const user = (await prisma.user.findUnique({
  where: { id: session.userId },
})) as any;  // ★ ここで any にキャスト

// メールが一致しない / すでに削除済み / 見つからない
const isDeleted = user?.isDeleted === true;  // ★ any から安全に取り出す

if (!user || user.email !== email || isDeleted) {
  return NextResponse.json(
    { error: "メールアドレスまたはパスワードに誤りがあります。" },
    { status: 400 }
  );
}

    // パスワードチェック
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードに誤りがあります。" },
        { status: 400 }
      );
    }

    // ★ 論理削除フラグを ON
    await prisma.user.update({
      where: { id: user.id },
      data: { isDeleted: true },
    });

    // ★ セッション Cookie を削除（ログアウト）
    await clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("account delete error", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
