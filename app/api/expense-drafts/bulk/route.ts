import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

export const runtime = 'nodejs';

// POST: bulk create drafts
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });

  const { drafts } = await req.json().catch(() => ({ drafts: [] as any[] }));
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return NextResponse.json({ ok: false, message: 'no drafts' }, { status: 400 });
  }

  const data = drafts.map((b: any) => ({
    userId: s.userId,
    registeredDate: new Date(b.registeredDate ?? new Date()),
    tradeDate: new Date(b.tradeDate),
    amount: Number(b.amount ?? 0),
    vendor: String(b.vendor ?? '未設定'),
    category: b.category || null,
    memo: b.memo || null,
    itemsSummary: b.itemsSummary || null,
  }));

  const ret = await prisma.draftExpense.createMany({ data });
  return NextResponse.json({ ok: true, created: ret.count });
}
