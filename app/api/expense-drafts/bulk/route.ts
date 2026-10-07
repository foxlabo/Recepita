import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { draftInputSchema, toDraftData } from '@/lib/drafts';

export const runtime = 'nodejs';

const bodySchema = z.object({
  drafts: z.array(draftInputSchema).min(1, '下書きがありません。').max(500, '一度に登録できる件数を超えています。'),
});

// POST: bulk create drafts
export const POST = withAuth(async (req, { session }) => {
  const { drafts } = await readJson(req, bodySchema);
  const ret = await prisma.draftExpense.createMany({
    data: drafts.map((b) => toDraftData(session.userId, b)),
  });
  return NextResponse.json({ ok: true, created: ret.count });
});
