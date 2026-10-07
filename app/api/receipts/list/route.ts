// New API: /api/receipts/list
// Purpose: Provide `rows` array for receipts UI expecting rows.map(...).
// Behavior: userId-scoped Expense list, returns both { items, rows: items }.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionOrThrow } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await getSessionOrThrow();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || '50')));
    const year = searchParams.get('year');
    const month = searchParams.get('month'); // 1-12
    const q = searchParams.get('q')?.trim();

    const where: any = { userId };

    if (q) {
      where.OR = [
        { memo: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12) {
        const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
        where.date = { gte: start, lt: end };
      }
    }

    const skip = (page - 1) * pageSize;

    const rows = await prisma.expense.findMany({
      where,
      take: pageSize,
      skip,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        date: true,
        amount: true,
        category: true,
        memo: true,
        vendor: true,       // ←必要なら
        createdAt: true,
        // リレーション: ExpenseItem[]
        lineItems: {
          select: {
            // ExpenseItem には title/item は無い。name だけ取得
            name: true,
            amount: true,    // 表示に使うなら
            createdAt: true,
            id: true,
          },
          take: 1,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        // スカラ: Json（配列の可能性あり）
        items: true,  // ← フィールド指定は不可。まずは丸ごと取る
      },
    });

// 先頭アイテム名の抽出（lineItems → JSON items の順でフォールバック）
const items = rows.map((r: any) => {
  const li = r.lineItems?.[0] ?? null;

  // JSON items は配列想定。先頭要素の name/description/item/title の順で拾う
  let jsonHead: any = null;
  if (Array.isArray(r.items) && r.items.length > 0) {
    jsonHead = r.items[0];
  }

  const itemName =
    li?.name ??
    jsonHead?.name ??
    jsonHead?.description ??
    jsonHead?.item ??
    jsonHead?.title ??
    null;

  return {
    id: r.id,
    date: r.date,
    amount: r.amount,
    category: r.category,
    memo: r.memo,
    itemName,               // 一覧表示用
    createdAt: r.createdAt,
  };
});

    const total = await prisma.expense.count({ where });

    return NextResponse.json({ items, rows: items, total, page, pageSize });
  } catch (err: any) {
    const msg = err?.message || 'Unexpected error';
    const status = /Unauthorized/.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
