// proxy.ts
// Edge of the app: cheap checks only (no database access here).
// - Verifies the session JWT signature/expiry with jose. Revocation
//   (sessionVersion) is checked by getSession()/withAuth in the app itself.
// - API requests without a valid session get 401 JSON; pages redirect to /login.
// - Cross-origin state-changing API requests are rejected (CSRF defence).
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

// 未ログインでもアクセスできるパス（完全一致、または配下）
const PUBLIC_PAGES = ['/login', '/signup'];
const PUBLIC_APIS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/expired',
  '/api/ping',
  '/api/account/email/verify', // メール内リンク（新規登録の認証）
  '/api/account/email/confirm', // メール内リンク（メールアドレス変更の確定）
  '/api/account/email/resend', // 確認メール再送
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function requestHost(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('host');
}

/** Origin header (when present) must match this request's host or APP_URL. */
function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin navigations / non-browser clients
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // includes the opaque "null" origin
  }
  if (originHost === requestHost(req)) return true;
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      if (originHost === new URL(appUrl).host) return true;
    } catch {
      /* ignore malformed APP_URL */
    }
  }
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  if (isApi && !SAFE_METHODS.has(req.method) && !isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = token ? (await verifySessionToken(token)) !== null : false;

  // ルート "/" はセッションの有無でリダイレクト
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = authed ? '/dashboard' : '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (matches(pathname, PUBLIC_PAGES)) {
    // ログイン済みならダッシュボードへ（失効済みなら (app) レイアウトが Cookie を消して戻す）
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (matches(pathname, PUBLIC_APIS)) return NextResponse.next();

  if (!authed) {
    if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// 適用範囲：Next の静的ファイル・画像・manifest/アイコン類は除外
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icon-[\\w-]+\\.png|.*\\.(?:png|jpe?g|gif|svg|webp|ico)$).*)',
  ],
};
