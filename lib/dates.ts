// lib/dates.ts
// Date helpers shared by client and server code.
//
// Convention: Recepita is a Japanese bookkeeping app, so "today", calendar
// dates and month boundaries are always evaluated in Japan Standard Time
// (UTC+9, no daylight saving time) — never in the time zone of the server or
// the browser.
//
// - Calendar dates (Expense.date, DraftExpense.tradeDate, Invoice.issueDate,
//   profile dates) travel as 'YYYY-MM-DD' strings and are stored as 00:00 UTC
//   of that date (`parseDateOnly`), i.e. 09:00 JST on the same day. This is
//   what `new Date('YYYY-MM-DD')` produced historically, so existing rows need
//   no migration.
// - Instants (createdAt, DraftExpense.registeredDate, …) are stored as they
//   are and shown with `formatDateJST`.
// - Filtering / aggregating by month (year, month) uses the half-open range
//   [monthRangeJST(year, month).start, .end): from 00:00 JST on the 1st to
//   00:00 JST on the 1st of the following month. With the storage rule above
//   both kinds of values land in the month of the JST date they display as.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type DateLike = Date | string | number;
export type YearMonth = { year: number; month: number };

const pad2 = (n: number) => String(n).padStart(2, '0');

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar-date notations accepted from forms, CSV files and OCR results. */
const DATE_ONLY_RE = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/;
/** ISO 8601 date-time (an instant), e.g. 2026-09-30T23:30:00+09:00. */
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Normalise a calendar date to 'YYYY-MM-DD'.
 * Accepts 2026-09-30, 2026/9/30, 2026.9.30, 2026年9月30日 (also full-width
 * digits) and ISO date-times (converted to their JST date). Returns undefined
 * for anything else, including impossible dates such as 2026-02-30.
 */
export function normalizeDateString(input: unknown): string | undefined {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? undefined : formatDateJST(input);
  if (typeof input !== 'string') return undefined;
  const s = input.normalize('NFKC').trim();
  if (!s) return undefined;
  const m = s.match(DATE_ONLY_RE);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return isValidYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : undefined;
  }
  if (ISO_DATETIME_RE.test(s)) {
    const t = new Date(s);
    return Number.isNaN(t.getTime()) ? undefined : formatDateJST(t);
  }
  return undefined;
}

/** Calendar date → Date stored as 00:00 UTC of that date (null when invalid). */
export function parseDateOnly(input: unknown): Date | null {
  const ymd = normalizeDateString(input);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parse a date sent by a client: a calendar date (see `normalizeDateString`)
 * becomes 00:00 UTC of that date; an ISO date-time or epoch milliseconds is
 * kept as that instant. Returns null when the value is not a valid date.
 */
export function parseDateInput(input: unknown): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    const t = new Date(input);
    return Number.isFinite(input) && !Number.isNaN(t.getTime()) ? t : null;
  }
  if (typeof input !== 'string') return null;
  const s = input.normalize('NFKC').trim();
  if (DATE_ONLY_RE.test(s)) return parseDateOnly(s);
  if (ISO_DATETIME_RE.test(s)) {
    const t = new Date(s);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  return null;
}

/**
 * 'YYYY-MM-DD' of the given value in JST ('' when missing/invalid).
 * Calendar-date strings are returned normalised as they are.
 */
export function formatDateJST(value: DateLike | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && DATE_ONLY_RE.test(value.normalize('NFKC').trim())) {
    return normalizeDateString(value) ?? '';
  }
  const t = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date in JST as 'YYYY-MM-DD'. */
export function todayJST(): string {
  return formatDateJST(new Date());
}

/** JST year and month (1–12) of the given instant (default: now). */
export function yearMonthJST(value: DateLike = new Date()): YearMonth {
  const t = value instanceof Date ? value : new Date(value);
  const shifted = new Date(t.getTime() + JST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** (year, month) shifted by `delta` months; handles year roll-over. */
export function addMonths(year: number, month: number, delta: number): YearMonth {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** 'YYYY-MM' label for (year, month). */
export function yearMonthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/**
 * UTC instants bounding a JST calendar month: `start` is 00:00 JST on the 1st,
 * `end` (exclusive) is 00:00 JST on the 1st of the following month.
 */
export function monthRangeJST(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS),
  };
}

/** True when (year, month) is a sensible month for filters. */
export function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && year >= 1900 && year <= 9999 && month >= 1 && month <= 12;
}
