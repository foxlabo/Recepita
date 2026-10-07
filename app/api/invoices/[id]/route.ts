// app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { assertFound } from '@/lib/http';

export const runtime = 'nodejs';

export const DELETE = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await prisma.invoice.deleteMany({
    where: { id: params.id, userId: session.userId },
  });
  assertFound(r.count);
  return NextResponse.json({ ok: true });
});
