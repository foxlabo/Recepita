import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: list drafts (unauthorized when not logged in)
export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });
  const rows = await prisma.draftExpense.findMany({
    where: { userId: s.userId },
    orderBy: { createdAt: 'desc' },
  });
  const items = rows.map(r => ({
    id: r.id,
    registeredDate: r.registeredDate.toISOString().slice(0,10),
    tradeDate: r.tradeDate.toISOString().slice(0,10),
    amount: r.amount,
    vendor: r.vendor,
    category: r.category ?? '',
    memo: r.memo ?? '',
    itemsSummary: r.itemsSummary ?? ''
  }));
  return NextResponse.json({ items });
}

// POST: create one draft
export async function POST(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  const b = await req.json();
  const row = await prisma.draftExpense.create({
    data: {
      userId: s.userId,
      registeredDate: new Date(),
      tradeDate: new Date(b.tradeDate),
      amount: Number(b.amount ?? 0),
      vendor: String(b.vendor ?? '未設定'),
      category: b.category || null,
      memo: b.memo || null,
      itemsSummary: b.itemsSummary || null,
    }
  });
  return NextResponse.json({ id: row.id });
}

// DELETE: delete by ids (or all with all=true)
export async function DELETE(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === 'true';
  if (all) {
    const result = await prisma.draftExpense.deleteMany({ where: { userId: s.userId } });
    return NextResponse.json({ ok: true, deleted: result.count });
  }
  const { ids } = await req.json().catch(()=>({ ids: [] as string[] }));
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: false, message: 'no ids' }, { status: 400 });
  const result = await prisma.draftExpense.deleteMany({ where: { userId: s.userId, id: { in: ids } } });
  return NextResponse.json({ ok: true, deleted: result.count });
}
