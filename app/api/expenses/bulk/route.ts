import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { dateInputSchema, idSchema } from '@/lib/validation';
import type { Prisma } from '@/lib/generated/prisma/client';

export const runtime = 'nodejs';

// ---- 品目テキストをパース ----
function parseItemsText(s?: string | null) {
  if (!s) return [];
  const parts = s
    .replace(/\r/g, '')
    .trim()
    .split(/[\n,、]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((p) => {
    const [nameRaw, priceRaw] = p.split(/[:：=]/).map((x) => (x || '').trim());
    const amt = Math.round(Number((priceRaw || '').replace(/[^0-9.]/g, '')) || 0);
    return {
      name: (nameRaw || '不明').slice(0, 500),
      qty: 1,
      unitPrice: amt,
      amount: amt,
      taxRate: 10,
    };
  });
}

// 受信値は一覧画面の編集内容（未編集の項目は含まれない）
const updateSchema = z.object({
  id: idSchema,
  date: z.union([z.literal(''), dateInputSchema]).optional(), // 空欄は更新しない
  // 入力欄が数値でない場合 NaN → JSON では null になるため、その場合は更新しない
  amount: z.number().nullish(),
  vendor: z.string().max(500).optional(),
  category: z.string().max(200).optional(),
  memo: z.string().max(5000).optional(),
  itemsText: z.string().max(10000).optional(),
});

const bodySchema = z.object({
  updates: z.array(updateSchema).min(1, '更新対象が選択されていません。').max(500, '一度に更新できる件数を超えています。'),
});

const INT_MAX = 2_147_483_647;

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

  let count = 0;
  for (const u of updates) {
    if (!owned.has(u.id)) continue;

    const data: Prisma.ExpenseUpdateInput = {};
    if (u.date) data.date = u.date;
    if (typeof u.amount === 'number' && Number.isFinite(u.amount) && Math.abs(u.amount) <= INT_MAX) {
      data.amount = Math.round(u.amount);
    }
    if (u.vendor !== undefined) data.vendor = u.vendor;
    if (u.category !== undefined) data.category = u.category || null;
    if (u.memo !== undefined) data.memo = u.memo;

    const items = parseItemsText(u.itemsText);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.expense.update({
        where: { id: u.id, userId: session.userId },
        data,
      });

      if (items.length) {
        await tx.expenseItem.deleteMany({ where: { expenseId: u.id } });
        await tx.expenseItem.createMany({
          data: items.map((it) => ({
            expenseId: u.id,
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
            taxRate: 10,
            amount: it.amount,
          })),
        });
      }
    });
    count++;
  }

  return NextResponse.json({ ok: true, count });
});
