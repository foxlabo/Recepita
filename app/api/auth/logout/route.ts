import { NextResponse } from 'next/server'; import { clearSessionCookie } from '@/lib/auth-server'; export async function POST(){ clearSessionCookie(); return NextResponse.json({ ok:true }); }
