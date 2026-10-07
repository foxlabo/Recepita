import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { dateInputSchema, expenseItemsSchema, int32Schema, optionalText } from '@/lib/validation';
import { expenseItemsText, lineItemsOrder, toLineItemCreateData } from '@/lib/items';

export const runtime = 'nodejs';

// GET /api/expenses … 一覧（date降順） + itemsSummary を付与
export const GET = withAuth(async (_req, { session }) => {
  const list = await prisma.expense.findMany({
    where: { userId: session.userId },
    orderBy: { date: 'desc' },
    include: { lineItems: { orderBy: lineItemsOrder } },
  });

  const withSummary = list.map((e) => ({
    ...e,
    itemsSummary: expenseItemsText(e) || undefined,
  }));

  return NextResponse.json(withSummary);
});

const createSchema = z.object({
  date: dateInputSchema,
  amount: z.coerce.number({ error: '金額は数値で入力してください。' }).pipe(int32Schema),
  vendor: z.string().max(500),
  memo: optionalText(5000),
  category: optionalText(200),
  items: expenseItemsSchema.nullish(),
  subtotal: int32Schema.nullish(),
  tax: int32Schema.nullish(),
  total: int32Schema.nullish(),
  paymentMethod: optionalText(100),
});

// POST /api/expenses … 作成（品目は ExpenseItem として保存）
export const POST = withAuth(async (req, { session }) => {
  const b = await readJson(req, createSchema);

  const row = await prisma.expense.create({
    data: {
      userId: session.userId,
      date: b.date,
      amount: b.amount,
      vendor: b.vendor,
      memo: b.memo ?? null,
      category: b.category ?? null,
      subtotal: b.subtotal ?? null,
      tax: b.tax ?? null,
      total: b.total ?? null,
      paymentMethod: b.paymentMethod ?? null,
      lineItems: b.items?.length ? { create: toLineItemCreateData(b.items) } : undefined,
    },
    include: { lineItems: { orderBy: lineItemsOrder } },
  });

  return NextResponse.json(row);
});
