// app/api/expenses/list/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import type { Prisma } from '@/lib/generated/prisma/client';
import { formatDateJST, isValidYearMonth, monthRangeJST } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function intParam(v: string | null, fallback: number) {
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
}

export const GET = withAuth(async (req, { session }) => {
  const url = new URL(req.url);
  const year = intParam(url.searchParams.get('year'), 0);
  const month = intParam(url.searchParams.get('month'), 0);
  const page = Math.max(1, intParam(url.searchParams.get('page'), 1));
  const pageSize = Math.max(1, Math.min(200, intParam(url.searchParams.get('pageSize'), 50)));

  // 必ずログインユーザーで絞る & 月指定があれば期間絞り（JST の月境界。lib/dates.ts 参照）
  const where: Prisma.ExpenseWhereInput = { userId: session.userId };
  if (isValidYearMonth(year, month)) {
    const { start, end } = monthRangeJST(year, month);
    where.date = { gte: start, lt: end };
  }

  const [total, rows] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      include: { lineItems: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((e) => {
    // ① items(JSON) があれば優先して "name[:amount]" で連結
    let fromJson = '';
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

    // ② JSONが空なら lineItems から "name[:amount]" を生成
    const fromLineItems = (e.lineItems ?? [])
      .map((li) => `${li.name ?? ''}${li.amount ? `:${li.amount}` : ''}`)
      .filter(Boolean)
      .join(', ');

    const itemsText = fromJson || fromLineItems || '';
    const vendor = e.vendor ?? '';

    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      date: formatDateJST(e.date), // 取引日（JST の YYYY-MM-DD）
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
});
