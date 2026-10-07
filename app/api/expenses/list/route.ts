// app/api/expenses/list/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import type { Prisma } from '@/lib/generated/prisma/client';
import { formatDateJST, isValidYearMonth, monthRangeJST } from '@/lib/dates';
import { expenseItemsText, lineItemsOrder } from '@/lib/items';

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
      include: { lineItems: { orderBy: lineItemsOrder } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    date: formatDateJST(e.date), // 取引日（JST の YYYY-MM-DD）
    amount: e.amount,
    vendor: e.vendor ?? '',
    category: e.category,
    memo: e.memo ?? '',
    // 品目は ExpenseItem（一括更新が書き込む先）を優先し、旧 JSON は予備
    itemsText: expenseItemsText(e),
  }));

  return NextResponse.json({ items, total, page, pageSize });
});
