import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

// GET one
export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

  const e = await prisma.expense.findFirst({
    where: { id: params.id, userId: s.userId },
    // items はスカラなので include しない。必要なら select で拾う。
    include: { lineItems: true },
  });

  if (!e) return NextResponse.json({ ok: false, message: 'not found' }, { status: 404 });
  return NextResponse.json(e);
}

// PUT update
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 });

  const body = await request.json();

  const updated = await prisma.expense.update({
    where: { id: params.id, userId: s.userId },
    data: {
      date: new Date(body.date),
      amount: Number(body.amount) || 0,
      vendor: String(body.vendor ?? ''),
      memo: body.memo ?? null,
      category: body.category ?? null,
      paymentMethod: body.paymentMethod ?? null,

      // もし items/subtotal/tax/total も更新するならここで
      items: body.items ?? undefined,
      subtotal: body.subtotal != null ? Number(body.subtotal) : undefined,
      tax: body.tax != null ? Number(body.tax) : undefined,
      total: body.total != null ? Number(body.total) : undefined,
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}
