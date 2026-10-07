import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth-server'
import {
  addMonths,
  formatDateJST,
  isValidYearMonth,
  monthRangeJST,
  yearMonthJST,
  yearMonthKey,
} from '@/lib/dates'

export const runtime = 'nodejs'

const TREND_MONTHS = 12

/** Date → 'YYYY-MM-DD HH:MM:SS.mmm' (UTC) for comparing with TIMESTAMP(3) columns in raw SQL. */
const sqlTimestamp = (d: Date) => d.toISOString().slice(0, 23).replace('T', ' ')

type MonthlyRow = { kind: 'expense' | 'sales'; ym: string; total: bigint | number | null }

export const GET = withAuth(async (req, { session }) => {
  // ▼ 認証は withAuth で実施済み（未ログインは 401）
  const userId = session.userId

  // 対象月（未指定・不正値は JST の今月）
  const { searchParams } = new URL(req.url)
  const now = yearMonthJST()
  const qYear = Number(searchParams.get('year'))
  const qMonth = Number(searchParams.get('month'))
  const { year, month } = isValidYearMonth(qYear, qMonth) ? { year: qYear, month: qMonth } : now

  // 12ヶ月分の月キー（古い順）と、その全期間（JST の月境界。lib/dates.ts 参照）
  const months = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const ym = addMonths(year, month, i - (TREND_MONTHS - 1))
    return yearMonthKey(ym.year, ym.month)
  })
  const first = addMonths(year, month, -(TREND_MONTHS - 1))
  const from = monthRangeJST(first.year, first.month).start
  const cur = monthRangeJST(year, month)
  const to = cur.end

  const [monthly, categories, recentExpenses, recentInvoices] = await Promise.all([
    // 月別合計（経費・売上）を 1 クエリで。日時は UTC で保存されているので
    // +9 時間して JST の年月で集計する。
    prisma.$queryRaw<MonthlyRow[]>`
      SELECT 'expense' AS kind, to_char("date" + interval '9 hours', 'YYYY-MM') AS ym, SUM("amount")::bigint AS total
      FROM "Expense"
      WHERE "userId" = ${userId}
        AND "date" >= ${sqlTimestamp(from)}::timestamp AND "date" < ${sqlTimestamp(to)}::timestamp
      GROUP BY 2
      UNION ALL
      SELECT 'sales' AS kind, to_char("issueDate" + interval '9 hours', 'YYYY-MM') AS ym, SUM("amount")::bigint AS total
      FROM "Invoice"
      WHERE "userId" = ${userId}
        AND "issueDate" >= ${sqlTimestamp(from)}::timestamp AND "issueDate" < ${sqlTimestamp(to)}::timestamp
      GROUP BY 2`,
    // カテゴリ別（今月）
    prisma.expense.groupBy({
      by: ['category'],
      where: { userId, date: { gte: cur.start, lt: cur.end } },
      _sum: { amount: true },
    }),
    // 最近5件
    prisma.expense.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, date: true, amount: true, vendor: true, category: true },
    }),
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, issueDate: true, amount: true, client: true },
    }),
  ])

  // ───────────────── 12ヶ月推移
  const expenseByMonth = new Map<string, number>()
  const salesByMonth = new Map<string, number>()
  for (const r of monthly) {
    const target = r.kind === 'expense' ? expenseByMonth : salesByMonth
    target.set(r.ym, Number(r.total ?? 0))
  }
  const expSeries = months.map((m) => expenseByMonth.get(m) ?? 0)
  const salesSeries = months.map((m) => salesByMonth.get(m) ?? 0)

  // ───────────────── 当月・前月（推移の末尾 2 か月と同じ値）
  const totalExpense = expSeries[TREND_MONTHS - 1]
  const totalSales = salesSeries[TREND_MONTHS - 1]
  const profit = totalSales - totalExpense
  const prevExpense = expSeries[TREND_MONTHS - 2]
  const prevSales = salesSeries[TREND_MONTHS - 2]
  const prevProfit = prevSales - prevExpense

  // ───────────────── カテゴリ集計（今月）
  const byCategory = new Map<string, number>()
  for (const c of categories) {
    const key = c.category || '未分類'
    byCategory.set(key, (byCategory.get(key) ?? 0) + (c._sum.amount ?? 0))
  }
  const categoryRows = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }))

  // ───────────────── アラート
  const alerts: { type: 'warning' | 'info' | 'danger'; message: string }[] = []
  if (totalSales === 0 && totalExpense === 0) {
    alerts.push({ type: 'info', message: '今月のデータがまだ登録されていません。' })
  }
  if (profit < 0) {
    alerts.push({ type: 'danger', message: '今月は経費が売上を上回り、赤字になっています。' })
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
      expenses: recentExpenses.map((e) => ({
        id: e.id,
        date: formatDateJST(e.date),
        amount: e.amount,
        vendor: e.vendor,
        category: e.category ?? '',
      })),
      invoices: recentInvoices.map((i) => ({
        id: i.id,
        date: formatDateJST(i.issueDate),
        amount: i.amount,
        client: i.client,
      })),
    },
    alerts,
  })
})
