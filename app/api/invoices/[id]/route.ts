// app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, withAuth } from '@/lib/auth-server';

export const runtime = 'nodejs';

export const DELETE = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await prisma.invoice.deleteMany({
    where: { id: params.id, userId: session.userId },
  });
  if (r.count === 0) return jsonError(404, 'not_found');
  return NextResponse.json({ ok: true });
});
