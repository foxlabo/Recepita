'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { axisTicks, type MomTone, monthOverMonth, niceAxis } from '@/lib/dashboard';
import { yearMonthJST } from '@/lib/dates';

type Summary = {
  expense: number;
  sales: number;
  profit: number;
  prev: { expense: number; sales: number; profit: number };
};
type CatRow = { name: string; amount: number };
type Trend = { months: string[]; expenses: number[]; sales: number[] };
type Recent = {
  expenses: { id: string; date: string; amount: number; vendor: string; category: string }[];
  invoices: { id: string; date: string; amount: number; client: string }[];
};
type Alert = { type: string; message: string; id?: string };
type ApiRes = {
  month: { year: number; month: number };
  summary: Summary;
  byCategory: CatRow[];
  trend: Trend;
  recent: Recent;
  alerts: Alert[];
};

function fmtYen(n: number) {
  return `¥${(n || 0).toLocaleString()}`;
}

/** 前月比の色（緑=良い / 赤=悪い）。どちらのテーマでも WCAG AA（4.5:1 以上）。 */
const TONE_CLASS: Record<MomTone, string> = {
  good: 'text-green-700 dark:text-green-400',
  bad: 'text-red-700 dark:text-red-400',
  neutral: 'text-(--muted)',
};
const TONE_SR: Record<MomTone, string> = { good: '（改善）', bad: '（悪化）', neutral: '' };

/* ===== 折れ線グラフ ===== */
/** 系列の色（ライト/ダークで濃さを変え、どちらの背景でも 3:1 以上）。凡例と共通。 */
const SERIES = [
  { key: 'sales', label: '売上', line: 'stroke-sky-600 dark:stroke-sky-400', dot: 'fill-sky-600 dark:fill-sky-400' },
  { key: 'expenses', label: '経費', line: 'stroke-red-600 dark:stroke-red-400', dot: 'fill-red-600 dark:fill-red-400' },
] as const;
const SWATCH: Record<(typeof SERIES)[number]['key'], string> = {
  sales: 'bg-sky-600 dark:bg-sky-400',
  expenses: 'bg-red-600 dark:bg-red-400',
};

/** Width of the element in CSS px (0 until measured), kept up to date with a ResizeObserver. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  // layout effect: measured before the first paint, so the chart does not pop in
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const FONT_PX = 12; // axis labels, rendered 1:1 (the SVG is drawn at the measured width, not scaled)
const DIGIT_PX = 7.2; // rough width of a digit / comma at 12px, for the left padding

/**
 * 12ヶ月推移。親要素の幅を測ってその幅で描く（viewBox = 実寸）ので、
 * 文字が縮まず、カードの幅いっぱいに広がる。高さは幅に応じて 200〜300px。
 */
function LineChart({ months, sales, expenses }: { months: string[]; sales: number[]; expenses: number[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = Math.round(Math.min(300, Math.max(200, width * 0.42)));

  const n = Math.min(months.length, sales.length, expenses.length);
  const clean = (arr: number[]) => arr.slice(0, n).map((v) => Math.max(0, Number(v) || 0));
  const values = { sales: clean(sales), expenses: clean(expenses) };
  const dataMax = Math.max(0, ...values.sales, ...values.expenses);
  const empty = dataMax === 0;
  const axis = niceAxis(dataMax);
  const ticks = empty ? [0] : axisTicks(axis);

  const tickLabel = (v: number) => v.toLocaleString('ja-JP');
  const padL = 12 + Math.max(...ticks.map((t) => tickLabel(t).length)) * DIGIT_PX;
  const padR = 18; // room for the last month label
  const padT = 10;
  const padB = 40; // 月 + 年（1月と先頭のみ）の 2 行
  const plotW = Math.max(0, width - padL - padR);
  const plotH = Math.max(0, height - padT - padB);
  const slot = n > 1 ? plotW / (n - 1) : plotW;
  const x = (i: number) => padL + (n > 1 ? i * slot : plotW / 2);
  const y = (v: number) => padT + plotH - (v / axis.max) * plotH;
  // 狭い画面では月ラベルを間引く（1 ラベルあたり 36px 以上）。最新の月から数えて等間隔に出す
  const labelEvery = Math.max(1, Math.ceil(36 / Math.max(1, slot)));
  const firstLabel = (n - 1) % labelEvery;

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block overflow-visible"
          role="img"
          aria-label="売上と経費の12ヶ月推移（折れ線グラフ）"
          fontSize={FONT_PX}
        >
          {/* グリッドと y 軸の目盛 */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'stroke-(--muted)' : 'stroke-(--border)'}
                strokeOpacity={t === 0 ? 0.6 : 1}
              />
              <text x={padL - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-(--muted) tabular-nums">
                {tickLabel(t)}
              </text>
            </g>
          ))}

          {/* x 軸の月（年は最初のラベルと年が変わったラベルだけ） */}
          {months.slice(0, n).map((ym, i) => {
            if ((i - firstLabel) % labelEvery !== 0 || i < firstLabel) return null;
            const [yy, mm] = ym.split('-');
            const showYear = i === firstLabel || months[i - labelEvery]?.slice(0, 4) !== yy;
            return (
              <text key={ym} x={x(i)} y={padT + plotH + 18} textAnchor="middle" className="fill-(--muted)">
                {`${Number(mm)}月`}
                {showYear && (
                  <tspan x={x(i)} dy="1.25em">
                    {yy}
                  </tspan>
                )}
              </text>
            );
          })}

          {/* 折れ線と点（点のツールチップは <title>）。全期間 0 なら線は描かずメッセージだけ */}
          {!empty &&
            SERIES.map((s) => (
              <g key={s.key}>
                <polyline
                  points={values[s.key].map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={s.line}
                />
                {values[s.key].map((v, i) => (
                  <circle
                    key={months[i]}
                    cx={x(i)}
                    cy={y(v)}
                    r={3.5}
                    strokeWidth={1.5}
                    className={`${s.dot} stroke-(--card)`}
                  >
                    <title>{`${months[i]} ${s.label} ${fmtYen(v)}`}</title>
                  </circle>
                ))}
              </g>
            ))}

          {empty && (
            <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" className="fill-(--muted)">
              この期間の売上・経費はありません
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
/* ===== 円グラフ ===== */
const PIE_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#6366f1', '#22d3ee'];

function PieChart({ rows, size = 220 }: { rows: CatRow[]; size?: number }) {
  const real = (rows ?? [])
    .map((r) => ({ name: r.name ?? '未分類', amount: Number(r.amount ?? 0) }))
    .filter((r) => r.amount > 0);

  let data = real;
  if (real.length === 1) {
    const eps = Math.max(1, real[0].amount) * 1e-6;
    data = [...real, { name: '__placeholder__', amount: eps }];
  }

  if (data.length === 0) {
    return <div className="rounded-lg border border-dashed p-6 text-center text-(--muted)">データがありません</div>;
  }

  const total = data.reduce((a, b) => a + b.amount, 0);
  const r = size / 2;
  const cx = r;
  const cy = r;
  let angle = -Math.PI / 2;
  const arcs = data.slice(0, 8).map((row, idx) => {
    const frac = row.amount / total;
    const ang2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle),
      y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(ang2),
      y2 = cy + r * Math.sin(ang2);
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    angle = ang2;
    return (
      <path
        key={row.name}
        d={d}
        fill={row.name === '__placeholder__' ? 'transparent' : PIE_COLORS[idx % PIE_COLORS.length]}
        stroke={row.name === '__placeholder__' ? 'transparent' : undefined}
      />
    );
  });

  return (
    <div className="flex w-full items-center justify-center gap-6">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        role="img"
        aria-label="カテゴリ別の経費（円グラフ）"
      >
        {arcs}
      </svg>
      {/* 凡例: 名前は可変幅（長い名前は省略して title で全文）、金額は右揃えの等幅数字 */}
      <ul className="min-w-0 max-w-64 flex-1 space-y-1.5 text-sm">
        {real.slice(0, 8).map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-sm"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-(--muted)" title={r.name}>
              {r.name}
            </span>
            <span className="shrink-0 pl-2 text-right font-medium tabular-nums">{fmtYen(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===== メイン ===== */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function Dashboard() {
  const now = yearMonthJST();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [data, setData] = useState<ApiRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/dashboard/summary?year=${year}&month=${month}`, { cache: 'no-store' });
        if (r.status === 401) {
          location.href = '/api/auth/expired';
          return;
        }
        const j = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !j) {
          setError(j?.error ?? 'データの取得に失敗しました。');
          return;
        }
        setError(null);
        setData(j as ApiRes);
      } catch {
        if (!cancelled) setError('通信に失敗しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const summary = data?.summary;
  // 売上・利益は増加が良い、経費は減少が良い（読込前は前月 0 扱いで「—」）
  const cards = (
    [
      { key: 'sales', label: '今月の売上', higherIsBetter: true },
      { key: 'expense', label: '今月の経費', higherIsBetter: false },
      { key: 'profit', label: '今月の利益', higherIsBetter: true },
    ] as const
  ).map((c) => ({
    ...c,
    value: summary?.[c.key] ?? 0,
    mom: monthOverMonth(summary?.[c.key] ?? 0, summary?.prev[c.key] ?? 0, c.higherIsBetter),
  }));

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">ダッシュボード</h2>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="表示する年"
            className="border rounded-sm px-2 py-1"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 8 })
              .map((_, i) => now.year - i)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
          <select
            aria-label="表示する月"
            className="border rounded-sm px-2 py-1"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-sm text-(--muted)">{loading ? '更新中…' : ''}</span>
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="text-sm font-semibold text-(--muted) leading-none min-h-[18px]">{c.label}</div>
              </div>
              <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight leading-none min-h-[36px] tabular-nums">
                {fmtYen(c.value)}
              </div>
              <div className="mt-2 text-xs font-medium">
                <span className="text-(--muted) font-normal">前月比</span>{' '}
                <span
                  className={`tabular-nums ${TONE_CLASS[c.mom.tone]}`}
                  data-tone={c.mom.tone}
                  title={c.mom.pct === null ? '前月のデータがありません' : undefined}
                >
                  {c.mom.label}
                  {TONE_SR[c.mom.tone] && <span className="sr-only">{TONE_SR[c.mom.tone]}</span>}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 下段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-4 border-b border-(--border) flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div>12ヶ月推移（売上/経費）</div>
              <div className="flex items-center gap-4 text-xs text-(--muted)">
                {SERIES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`h-1 w-4 rounded-full ${SWATCH[s.key]}`} />
                    {s.label}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {data?.trend?.months?.length ? (
                <LineChart months={data.trend.months} sales={data.trend.sales} expenses={data.trend.expenses} />
              ) : (
                <div className="text-sm text-(--muted)">{data ? 'データがありません' : '読込中…'}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>カテゴリ別（今月）円グラフ</CardHeader>
            <CardContent>
              {data?.byCategory?.length ? (
                <PieChart rows={data.byCategory} />
              ) : (
                <div className="text-sm text-(--muted)">{data ? 'データがありません' : '読込中…'}</div>
              )}
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
                    <th className="pb-1 text-left font-medium">日付</th>
                    <th className="pb-1 text-left font-medium">取引先</th>
                    <th className="pb-1 text-right font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recent?.expenses?.length ? (
                    data.recent.expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-0.5 pr-3 whitespace-nowrap tabular-nums">{e.date}</td>
                        <td className="py-0.5 pr-3">{e.vendor}</td>
                        <td className="py-0.5 text-right whitespace-nowrap tabular-nums">{fmtYen(e.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>—</td>
                    </tr>
                  )}
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
                    <th className="pb-1 text-left font-medium">日付</th>
                    <th className="pb-1 text-left font-medium">取引先</th>
                    <th className="pb-1 text-right font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recent?.invoices?.length ? (
                    data.recent.invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="py-0.5 pr-3 whitespace-nowrap tabular-nums">{i.date}</td>
                        <td className="py-0.5 pr-3">{i.client}</td>
                        <td className="py-0.5 text-right whitespace-nowrap tabular-nums">{fmtYen(i.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>アラート</CardHeader>
            <CardContent>
              {data?.alerts?.length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {data.alerts.map((a) => (
                    <li key={`${a.type}:${a.message}`}>{a.message}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-(--muted)">アラートはありません</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
