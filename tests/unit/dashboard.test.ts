import { describe, expect, it } from 'vitest';
import { monthOverMonth } from '@/lib/dashboard';

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
