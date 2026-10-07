import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'               // ★ default import（統一推奨）
import { getSession } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

type Defaults = {
  issuerName?: string
  issuerAddress?: string
  issuerTel?: string
  bankName?: string
  bankBranch?: string
  bankAccount?: string
  taxRate?: number
  dueDays?: number
  note?: string
}

// どのモデル名で存在しているかを動的に拾う（無ければ undefined）
function getRepo(client: any) {
  // プロジェクトごとに呼称が揺れやすいので候補を列挙
  return (
    client.invoiceDefaults ||
    client.invoiceDefault ||
    client.invoiceSetting ||
    client.invoiceSettings ||
    client.business ||       // 以前のコードで使われていた可能性
    undefined
  )
}

const SAFE_DEFAULTS: Defaults = {
  issuerName: '',
  issuerAddress: '',
  issuerTel: '',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  taxRate: 10,
  dueDays: 30,
  note: '',
}

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 })

  const repo = getRepo(prisma as any)

  // モデルが無い環境でも落ちない
  if (!repo?.findUnique) {
    return NextResponse.json({ ok: true, data: SAFE_DEFAULTS, source: 'fallback' })
  }

  const row = await repo.findUnique({
    where: { userId: s.userId },
  })

  return NextResponse.json({ ok: true, data: row ?? SAFE_DEFAULTS, source: row ? 'db' : 'fallback' })
}

export async function PUT(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({ ok: false, message: 'unauthorized' }, { status: 401 })

  const repo = getRepo(prisma as any)
  if (!repo?.upsert) {
    // モデル未作成なら保存はできないが落とさない
    return NextResponse.json({ ok: false, message: 'invoice-defaults model not found' }, { status: 501 })
  }

  const data = await req.json()

  const saved = await repo.upsert({
    where: { userId: s.userId },
    create: { userId: s.userId, ...data },
    update: { ...data },
  })

  return NextResponse.json({ ok: true, data: saved })
}
