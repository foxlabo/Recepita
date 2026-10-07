import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-server';

// GET /api/expenses … 一覧（date降順） + itemsSummary を付与
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json([], { status: 200 });

  const list = await prisma.expense.findMany({
    where: { userId: s.userId },
    orderBy: { date: 'desc' }
  });

  const withSummary = list.map((e: any) => ({
    ...e,
    itemsSummary: Array.isArray(e.items)
      ? e.items
          .map(
            (it: any) =>
              `${it?.name ?? '不明'}:${it?.total ?? it?.price ?? ''}`
          )
          .join(', ')
      : undefined
  }));

  return NextResponse.json(withSummary);
}

// POST /api/expenses … 作成（{ date, amount, vendor, memo?, category?, items?, subtotal?, tax?, total?, paymentMethod? }）
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const { date, amount, vendor, memo, category, items, subtotal, tax, total, paymentMethod } =
    await req.json();

  const row = await prisma.expense.create({
    data: {
      userId: s.userId,
      date: new Date(String(date)),   // 受け取った文字列→Dateに明示変換
      amount: Number(amount),
      vendor,
      memo,
      category,
      items,
      subtotal,
      tax,
      total,
      paymentMethod
    }
  });

  return NextResponse.json(row);
}
