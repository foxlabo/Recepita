import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

type Item = { name: string; qty: number; unitPrice: number; taxRate: number; amount: number };

async function resolveUserId(userIdFromClient?: string) {
  if (userIdFromClient) {
    const u = await prisma.user.findUnique({ where: { id: userIdFromClient }, select: { id: true } });
    if (u) return u.id;
  }
  if (process.env.DEFAULT_USER_ID) {
    const u = await prisma.user.findUnique({ where: { id: process.env.DEFAULT_USER_ID }, select: { id: true } });
    if (u) return u.id;
  }
  const any = await prisma.user.findFirst({ select: { id: true } });
  if (any) return any.id;
  throw new Error('NO_USER: 有効なユーザーが見つかりません。');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = await resolveUserId(body.userId);

    const date = body.date ? new Date(body.date) : new Date();
    const vendor = (body.vendor || 'Unknown Vendor').toString().slice(0, 191);
    const total = Number(body.total) || 0;
    const memo = body.memo ?? null;
    const category = body.category ?? null;
    const paymentMethod = body.paymentMethod ?? null;
    const items: Item[] = Array.isArray(body.items) ? body.items : [];

    const lineItems = items.map(it => ({
      name: (it.name || '').toString().slice(0, 1024),
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      taxRate: Number(it.taxRate) || 10,
      amount: Number(it.amount) || 0,
    }));

    const data: any = {
      userId,
      date,
      vendor,
      total,
      amount: total,
      category,
      paymentMethod,
      memo,
      items,
      lineItems: { create: lineItems },
    };

    const expense = await prisma.expense.create({ data, include: { lineItems: true } });
    return NextResponse.json({ id: expense.id });
  } catch (e: any) {
    console.error('[create-simple] error:', e);
    if (String(e?.message||'').startsWith('NO_USER:')) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'create failed' }, { status: 500 });
  }
}
