import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req: Request){
  const { email } = await req.json();
  const user = await prisma.user.findUnique({ where:{ email } });
  if(!user) return NextResponse.json({ ok:true }); // do not leak
  const token = Math.random().toString(36).slice(2);
  const exp = new Date(Date.now()+30*60*1000);
  await prisma.verificationToken.create({ data:{ token, userId: user.id, email, expiresAt: exp } });
  return NextResponse.json({ ok:true, token }); // demo: return token
}
