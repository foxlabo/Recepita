import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { localSaveTemp } from '@/lib/fileStorage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!file || !(file as any).arrayBuffer) {
    return NextResponse.json({ ok:false, message: 'file is required' }, { status: 400 });
  }
  const f = file as File;
  const buf = Buffer.from(await f.arrayBuffer());
  const { relPath } = localSaveTemp(f.name, buf);

  const rec = await prisma.receiptFile.create({
    data: {
      storage: 'local',
      path: relPath,
      original: f.name,
      mime: f.type || null,
      size: buf.length,
    }
  });

  return NextResponse.json({
    ok: true,
    file: { id: rec.id, name: rec.original, size: rec.size }
  });
}
