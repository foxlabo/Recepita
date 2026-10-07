// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 未ログインでもアクセスできるパス。
// ここに含まれない場合は recepita_session が必須。
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/ping",
  "/api/account/email/register",
  "/api/account/email/request",
  "/api/account/email/verify",
  "/api/account/email/confirm",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("recepita_session");

  // 0) ルート "/" は cookie だけで判定してリダイレクト
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = hasSession ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  // 1) 公開パスはスルー（prefix一致）
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // 1-α) ただしログイン/サインアップは、ログイン済ならダッシュボードへ
    if (hasSession && (pathname === "/login" || pathname === "/signup")) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 2) それ以外はセッション必須
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 3) ログイン済 → 通過
  return NextResponse.next();
}

// 適用範囲：_next配下や画像/ファビコンなどは除外
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
