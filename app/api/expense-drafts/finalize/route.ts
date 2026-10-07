import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

// POST /api/expense-drafts/finalize
// finalize={ids?: string[]} 省略時は全件
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(()=>({} as any));
  const ids: string[] | undefined = body?.ids;

  const drafts = await prisma.draftExpense.findMany({
    where: { userId: s.userId, ...(ids && ids.length ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' }
  });
  if (drafts.length === 0) return NextResponse.json({ ok: false, message: 'no drafts' }, { status: 400 });

  // Insert one by one to reuse existing structure; itemsSummary -> parse on server if needed (here keep in memo/items)
  for (const d of drafts) {
    await prisma.expense.create({
      data: {
        userId: s.userId,
        date: d.tradeDate,
        amount: d.amount,
        vendor: d.vendor,
        memo: d.memo,
        category: d.category,
        // items は必要に応じて itemsSummary を解析して作る。まずはメモ/サマリのみ。
      }
    });
  }
  // delete drafts
  await prisma.draftExpense.deleteMany({ where: { id: { in: drafts.map(x => x.id) }, userId: s.userId } });
  return NextResponse.json({ ok: true, created: drafts.length });
}