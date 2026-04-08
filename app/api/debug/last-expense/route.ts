import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ ok:false, message:'unauthorized' }, { status: 401 });

  const row = await prisma.expense.findFirst({
    where: { userId: s.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userId: true, date: true, amount: true, vendor: true }
  });
  return NextResponse.json({ ok:true, last: row });
}
