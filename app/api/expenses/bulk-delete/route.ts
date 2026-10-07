import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { assertFound, readJson } from '@/lib/http';
import { idListSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ ids: idListSchema });

export const POST = withAuth(async (req, { session }) => {
  const { ids } = await readJson(req, bodySchema);

  // ユーザー所有のIDに限定
  const myIds = (
    await prisma.expense.findMany({
      where: { userId: session.userId, id: { in: ids } },
      select: { id: true },
    })
  ).map((x) => x.id);
  assertFound(myIds.length); // 存在しない / 他人の経費のみ → 404

  // 子 → 親 の順（ExpenseItem → Expense）
  const [, result] = await prisma.$transaction([
    prisma.expenseItem.deleteMany({ where: { expenseId: { in: myIds } } }),
    prisma.expense.deleteMany({ where: { id: { in: myIds }, userId: session.userId } }),
  ]);

  return NextResponse.json({ ok: true, deleted: result.count });
});
