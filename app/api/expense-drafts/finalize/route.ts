import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { HttpError, readJson } from '@/lib/http';
import { parseItemsText, toExpenseItemData } from '@/lib/items';
import { idSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ ids: z.array(idSchema).max(1000).optional() });

// POST /api/expense-drafts/finalize
// body={ids?: string[]} 省略時は全件
export const POST = withAuth(async (req, { session }) => {
  const { ids } = await readJson(req, bodySchema);
  const userId = session.userId;

  const created = await prisma.$transaction(
    async (tx) => {
      const drafts = await tx.draftExpense.findMany({
        where: { userId, ...(ids?.length ? { id: { in: ids } } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      if (drafts.length === 0) throw new HttpError(400, '下書きがありません。');

      // 先に下書きを削除して「確保」する。同時に実行された別リクエストは
      // この行ロックの解放を待ち、削除済みのため件数が合わず 409 になる。
      // （二重クリックや並行リクエストで経費が二重登録されない）
      const { count } = await tx.draftExpense.deleteMany({
        where: { userId, id: { in: drafts.map((d) => d.id) } },
      });
      if (count !== drafts.length) {
        throw new HttpError(409, '下書きは既に登録されています。画面を更新してください。');
      }

      for (const d of drafts) {
        // 品目（"name:amount, …"）は一覧画面と同じく ExpenseItem として保存
        const lines = parseItemsText(d.itemsSummary);
        await tx.expense.create({
          data: {
            userId,
            date: d.tradeDate,
            amount: d.amount,
            vendor: d.vendor,
            memo: d.memo,
            category: d.category,
            ...(lines.length ? { lineItems: { create: toExpenseItemData(lines) } } : {}),
          },
        });
      }
      return drafts.length;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  return NextResponse.json({ ok: true, created });
});
