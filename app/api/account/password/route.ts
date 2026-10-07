import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/auth-server';

export async function POST(req: Request){
  const s = await getSession(); if(!s) return NextResponse.json({ error:'auth' }, { status:401 });
  const { current, next } = await req.json();
  const user = await prisma.user.findUnique({ where:{ id: s.userId } });
  if(!user) return NextResponse.json({ error:'auth' }, { status:401 });
  const ok = await bcrypt.compare(current, user.password);
  if(!ok) return NextResponse.json({ error:'invalid' }, { status:400 });
  const hash = await bcrypt.hash(next, 10);
  await prisma.user.update({ where:{ id: user.id }, data:{ password: hash } });
  return NextResponse.json({ ok:true });
}
