import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, withAuth } from '@/lib/auth-server';
import { MSG_NOT_FOUND, readJson } from '@/lib/http';
import { dateInputSchema, int32Schema, optionalText } from '@/lib/validation';
import type { Prisma } from '@/lib/generated/prisma/client';

export const runtime = 'nodejs';

// GET one（本人のデータのみ）
export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const e = await prisma.expense.findFirst({
    where: { id: params.id, userId: session.userId },
    include: { lineItems: true },
  });
  if (!e) return jsonError(404, MSG_NOT_FOUND);
  return NextResponse.json(e);
});

const updateSchema = z.object({
  date: dateInputSchema,
  amount: z.coerce.number({ error: '金額は数値で入力してください。' }).pipe(int32Schema),
  vendor: z.string().max(500).nullish(),
  memo: optionalText(5000),
  category: optionalText(200),
  paymentMethod: optionalText(100),
  items: z
    .array(
      z.object({
        name: optionalText(500),
        qty: z.number().nullish(),
        price: z.number().nullish(),
        total: z.number().nullish(),
      }),
    )
    .max(500)
    .nullish(),
  subtotal: z.coerce.number().pipe(int32Schema).nullish(),
  tax: z.coerce.number().pipe(int32Schema).nullish(),
  total: z.coerce.number().pipe(int32Schema).nullish(),
});

// PUT update（userId で絞るので他人の行は更新できない → 404）
export const PUT = withAuth<{ id: string }>(async (req, { session, params }) => {
  const body = await readJson(req, updateSchema);

  const updated = await prisma.expense.update({
    where: { id: params.id, userId: session.userId },
    data: {
      date: body.date,
      amount: body.amount,
      vendor: body.vendor ?? '',
      memo: body.memo ?? null,
      category: body.category ?? null,
      paymentMethod: body.paymentMethod ?? null,
      items: (body.items ?? undefined) as Prisma.InputJsonValue | undefined,
      subtotal: body.subtotal ?? undefined,
      tax: body.tax ?? undefined,
      total: body.total ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
});
