// Pure helpers for the dashboard (components/Dashboard.tsx): month-over-month
// comparison. No React, no DOM, so they are unit-tested.

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
