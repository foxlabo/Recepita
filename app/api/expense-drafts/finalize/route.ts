import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { idSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ ids: z.array(idSchema).max(1000).optional() });

// POST /api/expense-drafts/finalize
// body={ids?: string[]} 省略時は全件
export const POST = withAuth(async (req, { session }) => {
  const { ids } = await readJson(req, bodySchema);

  const drafts = await prisma.draftExpense.findMany({
    where: { userId: session.userId, ...(ids && ids.length ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (drafts.length === 0) return jsonError(400, '下書きがありません。');

  for (const d of drafts) {
    await prisma.expense.create({
      data: {
        userId: session.userId,
        date: d.tradeDate,
        amount: d.amount,
        vendor: d.vendor,
        memo: d.memo,
        category: d.category,
        // items は必要に応じて itemsSummary を解析して作る。まずはメモ/サマリのみ。
      },
    });
  }
  await prisma.draftExpense.deleteMany({
    where: { id: { in: drafts.map((x) => x.id) }, userId: session.userId },
  });
  return NextResponse.json({ ok: true, created: drafts.length });
});
