// app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth-server'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

// ★ これだけでOK（GET/POSTは消す）
export async function DELETE(_req: Request, props: Ctx) {
  const params = await props.params;
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'auth' }, { status: 401 })

  // 子テーブルがあれば先に削除（なければ不要）
  // await prisma.invoiceItem.deleteMany({ where: { invoiceId: params.id, userId: s.userId } })

  const r = await prisma.invoice.deleteMany({
    where: { id: params.id, userId: s.userId },
  })
  if (r.count === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
