import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMonths,
  formatDateJST,
  isValidYearMonth,
  monthRangeJST,
  normalizeDateString,
  parseDateInput,
  parseDateOnly,
  todayJST,
  yearMonthJST,
  yearMonthKey,
} from '@/lib/dates';

// The unit project runs with TZ=America/Los_Angeles (see vitest.config.ts), so
// every expectation below also proves the helpers ignore the machine's zone.

afterEach(() => {
  vi.useRealTimers();
});

describe('test environment', () => {
  it('runs outside JST', () => {
    expect(new Date('2026-01-15T00:00:00Z').getTimezoneOffset()).not.toBe(-540);
  });
});

describe('todayJST', () => {
  it('is still the same JST day at 23:30 JST', () => {
    vi.useFakeTimers({ now: new Date('2026-09-30T14:30:00Z') }); // 23:30 JST
    expect(todayJST()).toBe('2026-09-30');
  });

  it('is already the next JST day at 00:30 JST (still the previous day in UTC)', () => {
    vi.useFakeTimers({ now: new Date('2026-09-30T15:30:00Z') }); // 00:30 JST on 10/01
    expect(todayJST()).toBe('2026-10-01');
  });

  it('rolls over the year at 00:30 JST on January 1st', () => {
    vi.useFakeTimers({ now: new Date('2026-12-31T15:30:00Z') });
    expect(todayJST()).toBe('2027-01-01');
  });

  it('handles 29 February', () => {
    vi.useFakeTimers({ now: new Date('2028-02-28T15:00:00Z') });
    expect(todayJST()).toBe('2028-02-29');
  });
});

describe('yearMonthJST', () => {
  it('uses the JST month around the month boundary', () => {
    expect(yearMonthJST(new Date('2026-09-30T14:59:59.999Z'))).toEqual({ year: 2026, month: 9 });
    expect(yearMonthJST(new Date('2026-09-30T15:00:00Z'))).toEqual({ year: 2026, month: 10 });
  });

  it('rolls over the year', () => {
    expect(yearMonthJST(new Date('2026-12-31T14:30:00Z'))).toEqual({ year: 2026, month: 12 });
    expect(yearMonthJST(new Date('2026-12-31T15:30:00Z'))).toEqual({ year: 2027, month: 1 });
  });

  it('defaults to now', () => {
    vi.useFakeTimers({ now: new Date('2026-03-31T15:30:00Z') });
    expect(yearMonthJST()).toEqual({ year: 2026, month: 4 });
  });

  it('accepts strings and epoch milliseconds', () => {
    expect(yearMonthJST('2026-09-30T15:00:00Z')).toEqual({ year: 2026, month: 10 });
    expect(yearMonthJST(Date.UTC(2026, 8, 30, 15))).toEqual({ year: 2026, month: 10 });
  });
});

describe('formatDateJST', () => {
  it('formats instants as their JST calendar date', () => {
    expect(formatDateJST(new Date('2026-09-30T14:30:00Z'))).toBe('2026-09-30');
    expect(formatDateJST(new Date('2026-09-30T15:30:00Z'))).toBe('2026-10-01');
    expect(formatDateJST('2026-09-30T15:30:00.000Z')).toBe('2026-10-01');
    expect(formatDateJST(Date.UTC(2026, 11, 31, 15))).toBe('2027-01-01');
  });

  it('keeps calendar-date strings as they are (normalised)', () => {
    expect(formatDateJST('2026-09-30')).toBe('2026-09-30');
    expect(formatDateJST('2026/9/3')).toBe('2026-09-03');
  });

  it('shows a stored calendar date (00:00 UTC) as the same day', () => {
    expect(formatDateJST(parseDateOnly('2026-09-30'))).toBe('2026-09-30');
  });

  it('returns "" for missing or invalid values', () => {
    expect(formatDateJST(null)).toBe('');
    expect(formatDateJST(undefined)).toBe('');
    expect(formatDateJST('')).toBe('');
    expect(formatDateJST('not a date')).toBe('');
    expect(formatDateJST(new Date(Number.NaN))).toBe('');
    expect(formatDateJST('2026-02-30')).toBe('');
  });
});

describe('normalizeDateString', () => {
  it.each([
    ['2026-09-30', '2026-09-30'],
    ['2026/9/30', '2026-09-30'],
    ['2026.9.3', '2026-09-03'],
    ['2026年9月30日', '2026-09-30'],
    ['2026 年 9 月 30 日', '2026-09-30'],
    ['２０２６／０９／３０', '2026-09-30'],
    ['  2026-09-30  ', '2026-09-30'],
    ['2024-02-29', '2024-02-29'],
  ])('%j -> %s', (input, expected) => {
    expect(normalizeDateString(input)).toBe(expected);
  });

  it.each([
    '2026-02-29', // not a leap year
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-09-00',
    '1899-12-31',
    '26-09-30',
    '2026-09',
    'abc',
    '',
    '   ',
  ])('rejects %j', (input) => {
    expect(normalizeDateString(input)).toBeUndefined();
  });

  it('converts ISO date-times with an offset to their JST date', () => {
    expect(normalizeDateString('2026-09-30T23:30:00+09:00')).toBe('2026-09-30');
    expect(normalizeDateString('2026-09-30T15:30:00Z')).toBe('2026-10-01');
  });

  it('reads date-times without an offset as JST wall-clock time', () => {
    expect(normalizeDateString('2026-09-30T23:30')).toBe('2026-09-30');
    expect(normalizeDateString('2026-09-30 00:30:00')).toBe('2026-09-30');
  });

  it('accepts Date objects and rejects other types', () => {
    expect(normalizeDateString(new Date('2026-09-30T15:30:00Z'))).toBe('2026-10-01');
    expect(normalizeDateString(new Date(Number.NaN))).toBeUndefined();
    expect(normalizeDateString(20260930)).toBeUndefined();
    expect(normalizeDateString(null)).toBeUndefined();
    expect(normalizeDateString(undefined)).toBeUndefined();
  });
});

describe('parseDateOnly', () => {
  it('stores a calendar date as 00:00 UTC of that date', () => {
    expect(parseDateOnly('2026-09-30')?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(parseDateOnly('2026年1月2日')?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns null for invalid input', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });
});

describe('parseDateInput', () => {
  it('treats calendar dates like parseDateOnly', () => {
    expect(parseDateInput('2026/9/30')?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('keeps instants', () => {
    expect(parseDateInput('2026-09-30T15:30:00.000Z')?.toISOString()).toBe('2026-09-30T15:30:00.000Z');
    expect(parseDateInput(Date.UTC(2026, 0, 1))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const d = new Date('2026-05-05T05:05:05Z');
    expect(parseDateInput(d)).toBe(d);
  });

  it('reads date-times without an offset as JST', () => {
    expect(parseDateInput('2026-09-30T23:30')?.toISOString()).toBe('2026-09-30T14:30:00.000Z');
  });

  it('rejects invalid values', () => {
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('tomorrow')).toBeNull();
    expect(parseDateInput(Number.NaN)).toBeNull();
    expect(parseDateInput(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseDateInput(new Date(Number.NaN))).toBeNull();
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput({})).toBeNull();
  });
});

describe('monthRangeJST', () => {
  it('spans 00:00 JST on the 1st to 00:00 JST on the 1st of the next month', () => {
    const { start, end } = monthRangeJST(2026, 10);
    expect(start.toISOString()).toBe('2026-09-30T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T15:00:00.000Z');
  });

  it('rolls over the year in December', () => {
    const { start, end } = monthRangeJST(2026, 12);
    expect(start.toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  it('starts January at 15:00 UTC on 31 December of the previous year', () => {
    expect(monthRangeJST(2027, 1).start.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  it('contains stored calendar dates of the month and nothing else', () => {
    const { start, end } = monthRangeJST(2026, 9);
    const inRange = (d: Date | null) => !!d && d >= start && d < end;
    expect(inRange(parseDateOnly('2026-09-01'))).toBe(true);
    expect(inRange(parseDateOnly('2026-09-30'))).toBe(true);
    expect(inRange(parseDateOnly('2026-08-31'))).toBe(false);
    expect(inRange(parseDateOnly('2026-10-01'))).toBe(false);
  });

  it('contains instants by their JST date (23:30 / 00:30 JST)', () => {
    const { start, end } = monthRangeJST(2026, 9);
    const at = (iso: string) => new Date(iso);
    const inRange = (d: Date) => d >= start && d < end;
    expect(inRange(at('2026-09-30T14:30:00Z'))).toBe(true); // 09/30 23:30 JST
    expect(inRange(at('2026-09-30T15:30:00Z'))).toBe(false); // 10/01 00:30 JST
    expect(inRange(at('2026-08-31T15:30:00Z'))).toBe(true); // 09/01 00:30 JST
    expect(inRange(at('2026-08-31T14:30:00Z'))).toBe(false); // 08/31 23:30 JST
  });
});

describe('addMonths', () => {
  it.each([
    [2026, 10, 1, { year: 2026, month: 11 }],
    [2026, 12, 1, { year: 2027, month: 1 }],
    [2026, 1, -1, { year: 2025, month: 12 }],
    [2026, 10, -11, { year: 2025, month: 11 }],
    [2026, 3, -27, { year: 2023, month: 12 }],
    [2026, 3, 24, { year: 2028, month: 3 }],
    [2026, 5, 0, { year: 2026, month: 5 }],
  ])('(%i, %i) %+i -> %o', (y, m, delta, expected) => {
    expect(addMonths(y, m, delta)).toEqual(expected);
  });
});

describe('yearMonthKey / isValidYearMonth', () => {
  it('pads the month', () => {
    expect(yearMonthKey(2026, 3)).toBe('2026-03');
    expect(yearMonthKey(2026, 12)).toBe('2026-12');
  });

  it('validates year and month', () => {
    expect(isValidYearMonth(2026, 1)).toBe(true);
    expect(isValidYearMonth(2026, 12)).toBe(true);
    expect(isValidYearMonth(2026, 0)).toBe(false);
    expect(isValidYearMonth(2026, 13)).toBe(false);
    expect(isValidYearMonth(2026, 1.5)).toBe(false);
    expect(isValidYearMonth(1899, 1)).toBe(false);
    expect(isValidYearMonth(10000, 1)).toBe(false);
    expect(isValidYearMonth(Number.NaN, 1)).toBe(false);
  });
});
