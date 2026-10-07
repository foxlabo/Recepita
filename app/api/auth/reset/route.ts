import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request){
  const { token, newPassword } = await req.json();
  const t = await prisma.verificationToken.findUnique({ where:{ token } });
  if(!t || t.expiresAt < new Date()) return NextResponse.json({ error:'invalid' }, { status:400 });
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where:{ id: t.userId }, data:{ password: hash } });
  await prisma.verificationToken.delete({ where:{ token } });
  return NextResponse.json({ ok:true });
}
