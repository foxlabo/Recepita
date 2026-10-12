import { describe, expect, it } from 'vitest';
import { axisTicks, monthOverMonth, niceAxis } from '@/lib/dashboard';

describe('niceAxis', () => {
  it('ends just above the data instead of at the next power-of-ten multiple', () => {
    // the old 1/2/5 rounding of the maximum itself gave 500,000 here
    expect(niceAxis(297_000)).toEqual({ max: 300_000, step: 100_000 });
    expect(niceAxis(220_000)).toEqual({ max: 250_000, step: 50_000 });
    expect(niceAxis(29_150)).toEqual({ max: 30_000, step: 10_000 });
    expect(niceAxis(1_234)).toEqual({ max: 1_250, step: 250 });
  });

  it('uses steps of 1, 2, 2.5 or 5 × 10^n', () => {
    for (const v of [3, 7, 12, 99, 101, 640, 1_999, 48_000, 123_456, 9_876_543, 10_000_001]) {
      const { step } = niceAxis(v);
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 2.5, 5]).toContain(mantissa);
    }
  });

  it('keeps the data within the axis and uses at most maxIntervals intervals', () => {
    for (const v of [1, 2, 3, 7, 12, 99, 100, 101, 640, 1_000, 1_999, 48_000, 297_000, 1_000_000, 9_876_543]) {
      for (const maxIntervals of [4, 5, 6]) {
        const { max, step } = niceAxis(v, maxIntervals);
        expect(max).toBeGreaterThanOrEqual(v);
        expect(max - step).toBeLessThan(v); // the first multiple of the step at or above the data
        expect(max / step).toBeLessThanOrEqual(maxIntervals);
        expect(Number.isInteger(step)).toBe(true);
      }
    }
  });

  it('keeps an exact multiple as the maximum', () => {
    expect(niceAxis(100_000)).toEqual({ max: 100_000, step: 20_000 });
    expect(niceAxis(1_000)).toEqual({ max: 1_000, step: 200 });
  });

  it('never uses fractional steps for small amounts', () => {
    expect(niceAxis(1)).toEqual({ max: 1, step: 1 });
    expect(niceAxis(3)).toEqual({ max: 3, step: 1 });
    expect(niceAxis(12)).toEqual({ max: 15, step: 5 }); // not 2.5
  });

  it('falls back to 0–1 without positive data', () => {
    expect(niceAxis(0)).toEqual({ max: 1, step: 1 });
    expect(niceAxis(-5)).toEqual({ max: 1, step: 1 });
    expect(niceAxis(Number.NaN)).toEqual({ max: 1, step: 1 });
  });
});

describe('axisTicks', () => {
  it('lists 0 … max in steps', () => {
    expect(axisTicks({ max: 300_000, step: 100_000 })).toEqual([0, 100_000, 200_000, 300_000]);
    expect(axisTicks({ max: 1_250, step: 250 })).toEqual([0, 250, 500, 750, 1_000, 1_250]);
    expect(axisTicks({ max: 1, step: 1 })).toEqual([0, 1]);
  });
});

describe('monthOverMonth', () => {
  it('colors an increase green and a decrease red for sales and profit', () => {
    expect(monthOverMonth(297_000, 275_000, true)).toEqual({ pct: 8, label: '+8%', tone: 'good' });
    expect(monthOverMonth(12_345, 50_000, true)).toEqual({ pct: -75, label: '-75%', tone: 'bad' });
  });

  it('colors a decrease green and an increase red for expenses', () => {
    expect(monthOverMonth(29_150, 43_520, false)).toEqual({ pct: -33, label: '-33%', tone: 'good' });
    expect(monthOverMonth(1_500, 900, false)).toEqual({ pct: 67, label: '+67%', tone: 'bad' });
  });

  it('shows "—" without color when there is no previous month', () => {
    expect(monthOverMonth(1_000, 0, true)).toEqual({ pct: null, label: '—', tone: 'neutral' });
    expect(monthOverMonth(0, 0, false)).toEqual({ pct: null, label: '—', tone: 'neutral' });
  });

  it('is neutral when the rounded change is zero', () => {
    expect(monthOverMonth(1_000, 1_000, true)).toEqual({ pct: 0, label: '±0%', tone: 'neutral' });
    expect(monthOverMonth(1_000, 1_001, false)).toEqual({ pct: 0, label: '±0%', tone: 'neutral' }); // -0.1% → no "-0"
  });

  it('compares against the absolute previous value (a loss turning into a profit is an increase)', () => {
    expect(monthOverMonth(5_000, -10_000, true)).toEqual({ pct: 150, label: '+150%', tone: 'good' });
    expect(monthOverMonth(-20_000, -10_000, true)).toEqual({ pct: -100, label: '-100%', tone: 'bad' });
  });
});
