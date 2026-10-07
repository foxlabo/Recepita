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

/**
 * Parse CSV text into records keyed by the header row.
 * The header is the first line containing one of `knownHeaders` (so title
 * lines above the table are skipped), or the first line. Quoted cells and ""
 * escapes are supported; line breaks inside quotes are not. Rows whose cells
 * are all empty are skipped.
 */
export function parseCsv(text: string, knownHeaders: readonly string[] = []): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const toCells = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          inQ = false;
          continue;
        }
        cur += ch;
      } else {
        if (ch === ',') {
          out.push(cur);
          cur = '';
          continue;
        }
        if (ch === '"') {
          inQ = true;
          continue;
        }
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  let headerLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const cells = toCells(lines[i]).map((c) => c.trim());
    if (cells.some((c) => knownHeaders.includes(c))) {
      headerLineIndex = i;
      break;
    }
  }

  const header = toCells(lines[headerLineIndex]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = toCells(lines[i]);
    if (cells.every((c) => c.trim() === '')) continue;
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = (cells[idx] ?? '').trim();
    });
    rows.push(rec);
  }
  return rows;
}
