import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { assertFound, readJson } from '@/lib/http';
import { draftInputSchema, toDraftData } from '@/lib/drafts';
import { idListSchema } from '@/lib/validation';
import { formatDateJST } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: list drafts
export const GET = withAuth(async (_req, { session }) => {
  const rows = await prisma.draftExpense.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  const items = rows.map((r) => ({
    id: r.id,
    registeredDate: formatDateJST(r.registeredDate),
    tradeDate: formatDateJST(r.tradeDate),
    amount: r.amount,
    vendor: r.vendor,
    category: r.category ?? '',
    memo: r.memo ?? '',
    itemsSummary: r.itemsSummary ?? '',
  }));
  return NextResponse.json({ items });
});

// POST: create one draft（登録日はサーバー側で付与）
export const POST = withAuth(async (req, { session }) => {
  const b = await readJson(req, draftInputSchema);
  const row = await prisma.draftExpense.create({
    data: toDraftData(session.userId, { ...b, registeredDate: new Date() }),
  });
  return NextResponse.json({ id: row.id });
});

const deleteSchema = z.object({ ids: idListSchema });

// DELETE: delete by ids (or all with all=true)
export const DELETE = withAuth(async (req, { session }) => {
  const url = new URL(req.url);
  if (url.searchParams.get('all') === 'true') {
    const result = await prisma.draftExpense.deleteMany({ where: { userId: session.userId } });
    return NextResponse.json({ ok: true, deleted: result.count });
  }
  const { ids } = await readJson(req, deleteSchema);
  const result = await prisma.draftExpense.deleteMany({
    where: { userId: session.userId, id: { in: ids } },
  });
  assertFound(result.count); // 存在しない / 他人の下書きのみ → 404
  return NextResponse.json({ ok: true, deleted: result.count });
});
