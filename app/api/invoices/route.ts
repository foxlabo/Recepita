import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { idSchema, int32Schema } from '@/lib/validation';

export const runtime = 'nodejs';

// ============ 日付文字列 → Date 変換ユーティリティ ============
function normalizeIssueDate(input: unknown): Date | null {
  if (input instanceof Date) return input;
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  // Accept YYYY-MM-DD or YYYY/MM/DD
  const m = trimmed.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (m) {
    const y = Number(m[1]),
      mo = Number(m[2]),
      d = Number(m[3]);
    if (!y || !mo || !d) return null;
    // Save as UTC midnight to avoid TZ drift
    const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  // Fallback: try native Date parse (ISO string, etc.)
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

// ============ 一覧取得 ============
export const GET = withAuth(async (_req, { session }) => {
  const rows = await prisma.invoice.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(rows);
});

const createSchema = z.object({
  client: z.string({ error: '宛先を入力してください。' }).trim().min(1, '宛先を入力してください。').max(500),
  amount: int32Schema,
  issueDate: z.string({ error: '日付が正しくありません。' }).max(64),
});

// ============ 追加 ============
export const POST = withAuth(async (req, { session }) => {
  const { client, amount, issueDate } = await readJson(req, createSchema);
  const parsed = normalizeIssueDate(issueDate);
  if (!parsed) return jsonError(400, '日付が正しくありません。');

  const row = await prisma.invoice.create({
    data: { userId: session.userId, client, amount, issueDate: parsed },
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
