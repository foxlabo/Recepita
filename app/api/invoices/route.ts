import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-server';

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
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json([], { status: 200 });

  const rows = await prisma.invoice.findMany({
    where: { userId: s.userId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(rows);
}

// ============ 追加 ============
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const { client, amount, issueDate } = await req.json();
  const parsed = normalizeIssueDate(issueDate);
  if (!parsed) return NextResponse.json({ error: 'Invalid issueDate' }, { status: 400 });

  const row = await prisma.invoice.create({
    data: { userId: s.userId, client, amount, issueDate: parsed },
  });

  return NextResponse.json(row);
}

// ============ 1件削除 ============
export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const r = await prisma.invoice.deleteMany({
    where: { id, userId: s.userId },
  });

  if (r.count === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
