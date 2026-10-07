import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';
import type { Prisma } from '@/lib/generated/prisma/client';

export const runtime = 'nodejs';

// ---- 品目テキストをパース ----
function parseItemsText(s?: string) {
  if (!s) return [];
  const parts = s
    .replace(/\r/g, '')
    .trim()
    .split(/[\n,、]+/)
    .map(p => p.trim())
    .filter(Boolean);

  return parts.map(p => {
    const [nameRaw, priceRaw] = p
      .split(/[:：=]/)
      .map(x => (x || '').trim());
    const amt = Math.round(
      Number((priceRaw || '').replace(/[^0-9.]/g, '')) || 0
    );
    return {
      name: nameRaw || '不明',
      qty: 1,
      unitPrice: amt,
      amount: amt,
      taxRate: 10,
    };
  });
}

// ---- メイン処理 ----
export async function POST(request: Request) {
  const s = await getSession();
  if (!s)
    return NextResponse.json(
      { ok: false, message: 'unauthorized' },
      { status: 401 }
    );

  const body = await request.json().catch(() => ({}));
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  if (!updates.length)
    return NextResponse.json(
      { ok: false, message: 'no updates' },
      { status: 400 }
    );

  const results: any[] = [];

  for (const u of updates) {
    if (!u?.id) continue;

    // ---- 更新データ構築 ----
    const data: any = {};
    if (u.date) data.date = new Date(u.date);
    if (typeof u.amount === 'number') data.amount = u.amount;
    if (typeof u.vendor === 'string') data.vendor = u.vendor;
    if (typeof u.category === 'string')
      data.category = u.category || null;
    if (typeof u.memo === 'string') data.memo = u.memo;

    const items = parseItemsText(u.itemsText);

    // ---- ★ Prisma トランザクション（型付き） ----
    const updated = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const exp = await tx.expense.update({
          where: { id: u.id },
          data,
        });

        if (items.length) {
          await tx.expenseItem.deleteMany({
            where: { expenseId: u.id },
          });

          await tx.expenseItem.createMany({
            data: items.map((it: any) => ({
              expenseId: u.id,
              name: it.name,
              qty: it.qty ?? 1,
              unitPrice: it.unitPrice ?? it.amount ?? 0,
              taxRate: 10,
              amount: it.amount ?? it.unitPrice ?? 0,
            })),
          });
        }

        return exp;
      }
    );

    // updated は expense レコードなので updated.id が正しい
    results.push({ id: updated.id });
  }

  return NextResponse.json({ ok: true, count: results.length });
}
