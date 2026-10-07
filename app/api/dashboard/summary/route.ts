import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/auth-server'

type ExpenseType = Awaited<ReturnType<typeof prisma.expense.findMany>>[number]
type InvoiceType = Awaited<ReturnType<typeof prisma.invoice.findMany>>[number]

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 表示用（安全に YYYY-MM-DD 化）
function toYMD(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return d.toISOString().slice(0, 10)
}

export const GET = withAuth(async (req, { session: s }) => {
  // ▼ 認証は withAuth で実施済み（未ログインは 401）
  const userFilter = { userId: s.userId }

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year  = Number(searchParams.get('year'))  || now.getFullYear()
  const month = Number(searchParams.get('month')) || (now.getMonth() + 1)

  // 月の境界（Date）
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 1)
  // Prisma へ渡すのは ISO 文字列（どちらの型でもOK）
  const startISO = start.toISOString()
  const endISO   = end.toISOString()

  // ───────────────── 当月（userId で絞る）
  const [expenses, invoices] = await Promise.all([
    prisma.expense.findMany({
      where: { ...userFilter, date: { gte: start, lt: end } }, // Expense.date は DateTime
      orderBy: { date: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { ...userFilter, issueDate: { gte: startISO, lt: endISO } }, // ISO 文字列で比較
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const totalExpense = expenses.reduce((a: number, b: ExpenseType) => a + (b.amount ?? 0), 0)
  const totalSales   = invoices.reduce((a: number, b: InvoiceType) => a + (b.amount ?? 0), 0)
  const profit       = totalSales - totalExpense

  // ───────────────── 前月
  const pStart = new Date(year, month - 2, 1)
  const pEnd   = new Date(year, month - 1, 1)
  const pStartISO = pStart.toISOString()
  const pEndISO   = pEnd.toISOString()

  const [pExpenses, pInvoices] = await Promise.all([
    prisma.expense.findMany({ where: { ...userFilter, date: { gte: pStart, lt: pEnd } } }),
    prisma.invoice.findMany({ where: { ...userFilter, issueDate: { gte: pStartISO, lt: pEndISO } } }),
  ])
  const prevExpense = pExpenses.reduce((a: number, b: ExpenseType) => a + (b.amount ?? 0), 0)
  const prevSales   = pInvoices.reduce((a: number, b: InvoiceType) => a + (b.amount ?? 0), 0)
  const prevProfit  = prevSales - prevExpense

  // ───────────────── カテゴリ集計（今月）
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    const key = e.category ?? '未分類'
    byCategory[key] = (byCategory[key] ?? 0) + (e.amount ?? 0)
  }
  const categoryRows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }))

  // ───────────────── 12ヶ月推移
  const months: string[] = []
  const expSeries: number[] = []
  const salesSeries: number[] = []

  for (let i = 11; i >= 0; i--) {
    const sDate = new Date(year, month - 1 - i, 1)
    const eDate = new Date(year, month - i, 1)
    months.push(ymKey(sDate))

    const [ex, inv] = await Promise.all([
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { ...userFilter, date: { gte: sDate, lt: eDate } },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: { ...userFilter, issueDate: { gte: sDate.toISOString(), lt: eDate.toISOString() } },
      }),
    ])

    expSeries.push(Number(ex._sum.amount ?? 0))
    salesSeries.push(Number(inv._sum.amount ?? 0))
  }

  // ───────────────── 最近5件
  const [recentExpenses, recentInvoices] = await Promise.all([
    prisma.expense.findMany({
      where: { ...userFilter },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: { ...userFilter },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  // ───────────────── アラート
  const alerts: { type: 'warning' | 'info' | 'danger'; message: string }[] = []
  if (totalExpense > totalSales && (totalExpense > 0 || totalSales > 0)) {
    alerts.push({ type: 'warning', message: '今月は経費が売上を上回っています。' })
  }
  if (totalSales === 0 && totalExpense === 0) {
    alerts.push({ type: 'info', message: '今月のデータがまだ登録されていません。' })
  }
  if (profit < 0) {
    alerts.push({ type: 'danger', message: '今月は赤字になっています。' })
  }
  if (prevSales > 0 && totalSales < prevSales * 0.8) {
    alerts.push({ type: 'warning', message: '先月より売上が20%以上減少しています。' })
  }

  return NextResponse.json({
    month: { year, month },
    summary: {
      expense: totalExpense,
      sales: totalSales,
      profit,
      prev: { expense: prevExpense, sales: prevSales, profit: prevProfit },
    },
    byCategory: categoryRows,
    trend: { months, expenses: expSeries, sales: salesSeries },
    recent: {
      expenses: recentExpenses.map((e: ExpenseType) => ({
        id: e.id,
        date: toYMD(e.date),
        amount: e.amount,
        vendor: e.vendor,
        category: e.category ?? '',
      })),
      invoices: recentInvoices.map((i: InvoiceType) => ({
        id: i.id,
        date: toYMD(i.issueDate), // 表示用に整形
        amount: i.amount,
        client: i.client,
      })),
    },
    alerts,
  })
})
