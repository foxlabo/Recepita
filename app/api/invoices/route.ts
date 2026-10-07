import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { dateOnlySchema, idSchema, int32Schema } from '@/lib/validation';

export const runtime = 'nodejs';

// ============ 一覧取得 ============
export const GET = withAuth(async (_req, { session }) => {
  const rows = await prisma.invoice.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(rows);
});

const createSchema = z.object({
  client: z.string({ error: '売上名を入力してください。' }).trim().min(1, '売上名を入力してください。').max(500),
  amount: z.number({ error: '金額は数値で入力してください。' }).pipe(int32Schema),
  // 'YYYY-MM-DD' → その日の 00:00 UTC で保存（lib/dates.ts の規約）
  issueDate: dateOnlySchema('発行日'),
});

// ============ 追加 ============
export const POST = withAuth(async (req, { session }) => {
  const { client, amount, issueDate } = await readJson(req, createSchema);
  const row = await prisma.invoice.create({
    data: { userId: session.userId, client, amount, issueDate },
  });
  return NextResponse.json(row);
});

// ============ 1件削除 ============
export const DELETE = withAuth(async (req, { session }) => {
  const { id } = await readJson(req, z.object({ id: idSchema }));
  const r = await prisma.invoice.deleteMany({ where: { id, userId: session.userId } });
  if (r.count === 0) return jsonError(404, 'not_found');
  return NextResponse.json({ ok: true });
});
