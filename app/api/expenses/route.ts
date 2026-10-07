import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { dateInputSchema, int32Schema, optionalText } from '@/lib/validation';
import type { Prisma } from '@/lib/generated/prisma/client';

export const runtime = 'nodejs';

// GET /api/expenses … 一覧（date降順） + itemsSummary を付与
export const GET = withAuth(async (_req, { session }) => {
  const list = await prisma.expense.findMany({
    where: { userId: session.userId },
    orderBy: { date: 'desc' },
  });

  const withSummary = list.map((e: any) => ({
    ...e,
    itemsSummary: Array.isArray(e.items)
      ? e.items
          .map((it: any) => `${it?.name ?? '不明'}:${it?.total ?? it?.price ?? ''}`)
          .join(', ')
      : undefined,
  }));

  return NextResponse.json(withSummary);
});

const expenseItemsSchema = z
  .array(
    z.object({
      name: optionalText(500),
      qty: z.number().nullish(),
      price: z.number().nullish(),
      total: z.number().nullish(),
    }),
  )
  .max(500);

const createSchema = z.object({
  date: dateInputSchema,
  amount: z.coerce.number().pipe(int32Schema),
  vendor: z.string().max(500),
  memo: optionalText(5000),
  category: optionalText(200),
  items: expenseItemsSchema.nullish(),
  subtotal: int32Schema.nullish(),
  tax: int32Schema.nullish(),
  total: int32Schema.nullish(),
  paymentMethod: optionalText(100),
});

// POST /api/expenses … 作成
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
      items: (b.items ?? undefined) as Prisma.InputJsonValue | undefined,
      subtotal: b.subtotal ?? null,
      tax: b.tax ?? null,
      total: b.total ?? null,
      paymentMethod: b.paymentMethod ?? null,
    },
  });

  return NextResponse.json(row);
});
