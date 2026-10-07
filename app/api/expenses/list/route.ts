// app/api/expenses/list/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 50 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('pageSize') ?? 50)));

  // 必ずログインユーザーで絞る & 月指定があれば期間絞り
  const where: any = { userId: s.userId };
  if (year && month) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);
    where.date = { gte: start, lte: end };
  }

  const [total, rows] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      include: { lineItems: true },                 // ← スキーマ通り
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((e) => {
    // ① items(JSON) があれば優先して "name[:amount]" で連結
    let fromJson = '';
    try {
      const arr = Array.isArray(e.items) ? (e.items as any[]) : [];
      if (arr.length) {
        fromJson = arr
          .map((it) => {
            const nm = it?.name ?? it?.item ?? '';
            const am = it?.amount ?? it?.price ?? it?.unitPrice ?? '';
            return nm ? `${nm}${am ? `:${am}` : ''}` : '';
          })
          .filter(Boolean)
          .join(', ');
      }
    } catch { /* ignore JSON parse issues */ }

    // ② JSONが空なら lineItems から "name[:amount]" を生成
    const fromLineItems = (e.lineItems ?? [])
      .map((li) => `${li.name ?? ''}${li.amount ? `:${li.amount}` : ''}`)
      .filter(Boolean)
      .join(', ');

    const itemsText = fromJson || fromLineItems || '';

    // 取引先は vendor をそのまま返しつつ、フロント互換で client も同梱
    const vendor = e.vendor ?? '';

    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      date: e.date.toISOString(),
      amount: e.amount,
      vendor,
      client: vendor,        // ← 取引先列の互換
      category: e.category,
      memo: e.memo ?? '',
      itemsText,             // ← 過去実装と同名
      item: itemsText,       // ← 品目列が item を読む場合でも空にならない
    };
  });

  return NextResponse.json({ items, total, page, pageSize });
}
