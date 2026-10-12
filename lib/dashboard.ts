// Pure helpers for the dashboard (components/Dashboard.tsx): chart scale and
// month-over-month comparison. No React, no DOM, so they are unit-tested.

/** Tick steps are {1, 2, 2.5, 5} × 10^n (10 = 1 × 10^(n+1)). */
const STEP_MANTISSAS = [1, 2, 2.5, 5, 10];

export type Axis = { max: number; step: number };

/**
 * A "nice" y axis for non-negative amounts: the smallest step of the form
 * {1, 2, 2.5, 5} × 10^n that covers `dataMax` in at most `maxIntervals`
 * intervals, and the first multiple of that step at or above `dataMax`.
 * So the axis ends just above the data (297,000 → 300,000 in steps of
 * 100,000) instead of at the next power-of-ten multiple (500,000).
 *
 * Steps are whole yen (≥ 1), so tick labels never need decimals. Without
 * positive data the axis is 0–1.
 */
export function niceAxis(dataMax: number, maxIntervals = 5): Axis {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return { max: 1, step: 1 };
  const rough = dataMax / Math.max(1, Math.floor(maxIntervals));
  let pow = 10 ** Math.floor(Math.log10(rough));
  if (pow * 10 <= rough) pow *= 10; // log10 rounding just below a power of ten
  const candidate = STEP_MANTISSAS.map((m) => m * pow).find((s) => s >= rough && Number.isInteger(s));
  const step = Math.max(1, candidate ?? 1);
  return { max: Math.ceil(dataMax / step) * step, step };
}

/** The tick values 0, step, 2·step, …, max of an axis. */
export function axisTicks({ max, step }: Axis): number[] {
  const count = Math.round(max / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** good / bad from the user's point of view; neutral = no change or no comparison. */
export type MomTone = 'good' | 'bad' | 'neutral';

export type MonthOverMonth = {
  /** Change in percent, rounded; null when there is nothing to compare with. */
  pct: number | null;
  /** "+8%", "-33%", "±0%" or "—". */
  label: string;
  tone: MomTone;
};

/**
 * Month-over-month change of a dashboard figure.
 *
 * `higherIsBetter` is true for sales and profit (an increase is good) and
 * false for expenses (a decrease is good). A previous value of 0 means there
 * is no previous month to compare with: the ratio is undefined, shown as "—"
 * without a color. The ratio is taken against |previous| so that a profit
 * going from -10,000 to +5,000 counts as an increase.
 */
export function monthOverMonth(current: number, previous: number, higherIsBetter: boolean): MonthOverMonth {
  if (!previous || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return { pct: null, label: '—', tone: 'neutral' };
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100) || 0; // `|| 0`: no "-0"
  if (pct === 0) return { pct: 0, label: '±0%', tone: 'neutral' };
  const up = pct > 0;
  return {
    pct,
    label: up ? `+${pct}%` : `${pct}%`,
    tone: up === higherIsBetter ? 'good' : 'bad',
  };
}
