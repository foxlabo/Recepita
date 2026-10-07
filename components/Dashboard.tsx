'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { yearMonthJST } from '@/lib/dates'

type Summary = {
  expense: number; sales: number; profit: number
  prev: { expense:number; sales:number; profit:number }
}
type CatRow = { name: string; amount: number }
type Trend = { months: string[]; expenses: number[]; sales: number[] }
type Recent = {
  expenses: { id: string; date: string; amount: number; vendor: string; category: string }[];
  invoices: { id: string; date: string; amount: number; client: string }[];
}
type Alert = { type: string; message: string; id?: string }
type ApiRes = {
  month: { year:number; month:number }
  summary: Summary
  byCategory: CatRow[]
  trend: Trend
  recent: Recent
  alerts: Alert[]
}

function fmtYen(n:number){ return '¥'+(n||0).toLocaleString() }
/** 前月比（%）。前月が 0 のときは比率を定義できないので null。 */
function diffPct(cur:number, prev:number): number | null {
  if (prev === 0) return null
  return Math.round(((cur - prev) / Math.abs(prev)) * 100)
}
const sign = (n:number)=> (n>0? `+${n}` : `${n}`)

/* ===== 折れ線グラフ ===== */
function LineChart({ months, a, b, height=200 }:{ months:string[]; a:number[]; b:number[]; height?:number }){
  const n = Math.max(0, Math.min(months.length, a.length, b.length))
  const M = months.slice(0, n)
  const A = a.slice(0, n).map(v => Number(v ?? 0))
  const B = b.slice(0, n).map(v => Number(v ?? 0))

  // --- y軸を 1/2/5 × 10^k の“きれいな値”に丸める
  const rawMax = Math.max(1, ...A, ...B)
  const pow10 = Math.pow(10, Math.max(0, Math.floor(Math.log10(rawMax))))
  const mant = rawMax / pow10
  const niceMant = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 5 ? 5 : 10
  const maxY = niceMant * pow10

  const pad = 32
  const width = 720
  const heightPx = height
  const plotW = width - pad * 2
  const plotH = heightPx - pad * 2
  const xStep = n > 1 ? plotW / (n - 1) : 0

  const toXY = (v:number,i:number)=>[ pad + i*xStep, pad + (plotH) - (v/maxY)*plotH ] as const

  const path = (arr:number[], color:string)=>{
    const pts = arr.map((v,i)=>toXY(v,i))
    const d = pts.map((p,i)=> i?`L ${p[0]} ${p[1]}`:`M ${p[0]} ${p[1]}`).join(' ')
    return <path d={d} stroke={color} fill="none" strokeWidth={2} />
  }

  return (
    <svg width="100%" height={heightPx} viewBox={`0 0 ${width} ${heightPx}`} preserveAspectRatio="xMidYMid meet" className="block">
      {/* X軸 */}
      <line x1={pad} y1={pad+plotH} x2={width-pad} y2={pad+plotH} stroke="currentColor" opacity={0.25}/>

      {/* グリッド & 目盛 0/25/50/75/100% */}
      {[0,0.25,0.5,0.75,1].map((frac,idx)=>{
        const y = pad + (1-frac)*plotH
        const val = Math.round(maxY*frac).toLocaleString()
        return (
          <g key={idx}>
            <line x1={pad} y1={y} x2={width-pad} y2={y} stroke="currentColor" opacity={0.12}/>
            <text x={4} y={y+4} fontSize="10" fill="currentColor" opacity="0.7">{val}</text>
          </g>
        )
      })}

      {/* X軸ラベル（月） */}
      {M.map((m,i)=>{
        const x = pad + i*xStep
        return <text key={i} x={x} y={heightPx-6} fontSize="10" fill="currentColor" opacity="0.7" textAnchor="middle">{m.slice(2)}</text>
      })}

      {/* ライン */}
      {path(A,'#0ea5e9')}
      {path(B,'#ef4444')}

      {/* データ無し */}
      {!n && (
        <text x={width/2} y={heightPx/2} fontSize="12" fill="currentColor" opacity="0.5" textAnchor="middle">データがありません</text>
      )}
    </svg>
  )
}
/* ===== 円グラフ ===== */
const PIE_COLORS = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#6366f1','#22d3ee']

function PieChart({ rows, size=220 }:{ rows:CatRow[]; size?:number }){
  const real = (rows ?? [])
    .map(r => ({ name: r.name ?? '未分類', amount: Number(r.amount ?? 0) }))
    .filter(r => r.amount > 0)

  let data = real
  if (real.length === 1) {
    const eps = Math.max(1, real[0].amount) * 1e-6
    data = [...real, { name: '__placeholder__', amount: eps }]
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-(--muted)">
        データがありません
      </div>
    )
  }

  const total = data.reduce((a,b)=>a+b.amount, 0)
  const r = size/2; const cx=r; const cy=r
  let angle = -Math.PI/2
  const arcs = data.slice(0,8).map((row,idx)=>{
    const frac = row.amount / total
    const ang2 = angle + frac * Math.PI*2
    const large = frac > 0.5 ? 1 : 0
    const x1 = cx + r*Math.cos(angle), y1 = cy + r*Math.sin(angle)
    const x2 = cx + r*Math.cos(ang2),  y2 = cy + r*Math.sin(ang2)
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    angle = ang2
    return (
      <path
        key={idx}
        d={d}
        fill={row.name === '__placeholder__' ? 'transparent' : PIE_COLORS[idx % PIE_COLORS.length]}
        stroke={row.name === '__placeholder__' ? 'transparent' : undefined}
      />
    )
  })

  return (
    <div className="flex items-center gap-4 justify-center w-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {arcs}
      </svg>
      <div className="space-y-1">
        {real.slice(0,8).map((r,i)=>(
          <div key={r.name} className="text-sm flex items-center gap-2">
            <span className="w-3 h-3 inline-block rounded-sm" style={{background: PIE_COLORS[i % PIE_COLORS.length]}}/>
            <span className="w-28 truncate text-(--muted)" title={r.name}>{r.name}</span>
            <span className="font-medium">{fmtYen(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== メイン ===== */
export default function Dashboard(){
  const now = yearMonthJST()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [data, setData] = useState<ApiRes | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(()=>{
    let cancelled = false
    async function load(){
      setLoading(true)
      try{
        const r = await fetch(`/api/dashboard/summary?year=${year}&month=${month}`, { cache: 'no-store' })
        if (r.status === 401) { location.href = '/api/auth/expired'; return }
        const j = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !j) { setError(j?.error ?? 'データの取得に失敗しました。'); return }
        setError(null)
        setData(j as ApiRes)
      } catch {
        if (!cancelled) setError('通信に失敗しました。')
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [year, month])

  const summary = data?.summary
  const pctSales   = summary ? diffPct(summary.sales,   summary.prev.sales)   : null
  const pctExpense = summary ? diffPct(summary.expense, summary.prev.expense): null
  const pctProfit  = summary ? diffPct(summary.profit,  summary.prev.profit)  : null

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">ダッシュボード</h2>
        <div className="ml-auto flex items-center gap-2">
          <select className="border rounded-sm px-2 py-1" value={year} onChange={e=>setYear(Number(e.target.value))}>
            {Array.from({length:8}).map((_,i)=>now.year-i).map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select className="border rounded-sm px-2 py-1" value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
          <span className="text-sm text-(--muted)">{loading ? '更新中…' : ''}</span>
        </div>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { key:'sales',  label:"今月の売上",  value: summary?.sales   ?? 0, pct: pctSales},
          { key:'expense',label:"今月の経費",  value: summary?.expense ?? 0, pct: pctExpense},
          { key:'profit', label:"今月の利益",  value: summary?.profit  ?? 0, pct: pctProfit},
        ].map((c)=>( 
          <Card key={c.key}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="text-sm font-semibold text-(--muted) leading-none min-h-[18px]">
                  {c.label}
                </div>
              </div>
              <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight leading-none min-h-[36px]">
                {fmtYen(c.value)}
              </div>
              <div className="mt-2 text-xs font-medium">
                <span className="text-(--muted) font-normal">前月比</span>{' '}
                {c.pct === null
                  ? <span className="text-(--muted)" title="前月のデータがありません">—</span>
                  : <span className={c.pct >= 0 ? 'text-green-600' : 'text-rose-600'}>{`${sign(c.pct)}%`}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 下段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>12ヶ月推移（売上/経費）</CardHeader>
            <CardContent>
              {data?.trend?.months?.length
                ? (<div className="w-full flex justify-center"><LineChart months={data.trend.months} a={data.trend.sales} b={data.trend.expenses} /></div>)
                : <div className="text-sm text-(--muted)">{data ? 'データがありません' : '読込中…'}</div>}
              <div className="mt-2 flex items-center gap-4 text-xs text-(--muted)">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 inline-block rounded-sm" style={{ background: '#0ea5e9' }}></span>売上
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 inline-block rounded-sm" style={{ background: '#ef4444' }}></span>経費
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>カテゴリ別（今月）円グラフ</CardHeader>
            <CardContent>
              {data?.byCategory?.length
                ? <PieChart rows={data.byCategory} />
                : <div className="text-sm text-(--muted)">{data ? 'データがありません' : '読込中…'}</div>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>直近の経費（5件）</CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-(--muted)">
                    <th className="text-left">日付</th>
                    <th className="text-left">取引先</th>
                    <th className="text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recent?.expenses?.length
                    ? data.recent.expenses.map(e=>(
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.vendor}</td>
                        <td className="text-right">{fmtYen(e.amount)}</td>
                      </tr>
                    ))
                    : <tr><td colSpan={3}>—</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>直近の売上（5件）</CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-(--muted)">
                    <th className="text-left">日付</th>
                    <th className="text-left">取引先</th>
                    <th className="text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recent?.invoices?.length
                    ? data.recent.invoices.map(i=>(
                      <tr key={i.id}>
                        <td>{i.date}</td>
                        <td>{i.client}</td>
                        <td className="text-right">{fmtYen(i.amount)}</td>
                      </tr>
                    ))
                    : <tr><td colSpan={3}>—</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>アラート</CardHeader>
            <CardContent>
              {data?.alerts?.length
                ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {data.alerts.map((a,idx)=>(<li key={idx}>{a.message}</li>))}
                  </ul>
                )
                : <div className="text-sm text-(--muted)">アラートはありません</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
