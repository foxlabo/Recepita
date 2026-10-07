// app/api/auth/expired/route.ts
// Pages redirect here when the cookie's JWT is well-formed (so proxy.ts lets
// it through) but the session was revoked server-side. Clearing the cookie
// here prevents a /login <-> /dashboard redirect loop.
import { NextResponse } from 'next/server';
import { getSession, clearedSessionCookie } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  // Relative Location: does not depend on the (client-controlled) Host header.
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: session ? '/dashboard' : '/login', 'Cache-Control': 'no-store' },
  });
  if (!session) res.cookies.set(clearedSessionCookie());
  return res;
}
