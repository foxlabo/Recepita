import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import { localFullPath } from '@/lib/fileStorage';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const file = await prisma.receiptFile.findUnique({ where: { id } });
  if (!file) return new NextResponse('not found', { status: 404 });
  if (file.storage !== 'local') return new NextResponse('unsupported storage', { status: 400 });

  const full = localFullPath(file.path);
  if (!fs.existsSync(full)) return new NextResponse('gone', { status: 410 });

  const data = fs.readFileSync(full);
  return new NextResponse(data, {
    headers: {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.original)}`,
      'Content-Length': String(file.size || data.length),
      'Cache-Control': 'private, max-age=0',
    },
  });
}
