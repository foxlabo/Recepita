// lib/csv.ts
// Shared CSV helpers (usable from both client and server code).

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escape a single CSV cell.
 * - Text starting with = + - @ (or tab/CR) is prefixed with a single quote so
 *   spreadsheet apps do not evaluate it as a formula (CSV/formula injection).
 *   Real numbers are left untouched so negative amounts stay numeric.
 * - Line breaks are flattened and cells containing quotes/commas are quoted.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value).replace(/\r\n|\r|\n/g, ' ');
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}
