import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { assertFound, readJson } from '@/lib/http';
import { dateInputSchema, idSchema, int32Schema } from '@/lib/validation';
import { parseItemsText, toExpenseItemData } from '@/lib/items';
import { Prisma } from '@/lib/generated/prisma/client';

export const runtime = 'nodejs';

// 受信値は一覧画面の編集内容（未編集の項目は含まれない）
const updateSchema = z.object({
  id: idSchema,
  date: z.union([z.literal(''), dateInputSchema]).optional(), // 空欄は更新しない
  amount: z
    .number({ error: '金額は数値で入力してください。' })
    .transform((n) => Math.round(n))
    .pipe(int32Schema)
    .optional(),
  vendor: z.string().max(500).optional(),
  category: z.string().max(200).optional(),
  memo: z.string().max(5000).optional(),
  /** "name:amount, …"（lib/items.ts）。指定時は ExpenseItem を置き換える（空文字は全削除） */
  itemsText: z.string().max(10000).optional(),
});

const bodySchema = z.object({
  updates: z
    .array(updateSchema)
    .min(1, '更新対象が選択されていません。')
    .max(500, '一度に更新できる件数を超えています。'),
});

export const POST = withAuth(async (req, { session }) => {
  const { updates } = await readJson(req, bodySchema);

  // 本人の経費だけを対象にする（他人の ID は黙って無視）
  const owned = new Set(
    (
      await prisma.expense.findMany({
        where: { userId: session.userId, id: { in: updates.map((u) => u.id) } },
        select: { id: true },
      })
    ).map((x) => x.id),
  );
  assertFound(owned.size); // 存在しない / 他人の経費のみ → 404

  const targets = updates.filter((u) => owned.has(u.id));

  // 全件を 1 トランザクションで（途中で失敗したら何も更新しない）
  await prisma.$transaction(
    async (tx) => {
      for (const u of targets) {
        const data: Prisma.ExpenseUpdateInput = {};
        if (u.date) data.date = u.date;
        if (u.amount !== undefined) data.amount = u.amount;
        if (u.vendor !== undefined) data.vendor = u.vendor;
        if (u.category !== undefined) data.category = u.category || null;
        if (u.memo !== undefined) data.memo = u.memo;

        if (u.itemsText !== undefined) {
          // 品目は ExpenseItem が正。旧 JSON(items) は一覧の表示元にならないよう消す
          data.items = Prisma.DbNull;
          data.lineItems = {
            deleteMany: {},
            create: toExpenseItemData(parseItemsText(u.itemsText)),
          };
        }

        await tx.expense.update({
          where: { id: u.id, userId: session.userId },
          data,
        });
      }
    },
    { timeout: 30_000 },
  );

  return NextResponse.json({ ok: true, count: targets.length });
});
