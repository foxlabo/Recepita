// lib/items.ts
// Item lines (品目) — shared by the client screens and the API routes.
//
// Text format used by every screen: "name:amount, name2:amount2"
// - items are separated by a newline, '、' or ',' (a comma inside a number
//   such as 1,200 is a thousands separator, not an item separator);
// - name and amount are separated by the last ':', '：' or '=';
// - amounts are integer yen and may be negative (値引き: -50, ▲50, △50).
//
// Storage: ExpenseItem rows (Expense.lineItems) are the source of truth and
// are what the 経費一覧 edit writes. The legacy Expense.items JSON column is
// only read as a fallback for old rows that have no ExpenseItem rows.

export type ItemLine = { name: string; amount: number };

/** Remove thousands separators ("1,234,567" → "1234567"). */
const stripThousands = (s: string) => s.replace(/(\d),(?=\d{3}(?:[,、\s円.)]|$))/g, '$1');

/**
 * Lenient yen amount: first number in the text, negative when a minus sign
 * (-, −, ▲, △) precedes it; decimals are rounded. undefined when no number.
 * "¥1,200" → 1200, "-¥50" → -50, "▲50" → -50, "100円(税込)" → 100.
 */
export function parseYen(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : undefined;
  if (raw === null || raw === undefined) return undefined;
  const s = stripThousands(String(raw).normalize('NFKC'));
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m || m.index === undefined) return undefined;
  const n = Math.round(Number(m[0]));
  if (!Number.isFinite(n)) return undefined;
  const negative = /[-−▲△]/.test(s.slice(0, m.index));
  return negative && n !== 0 ? -n : n;
}

/**
 * Strict amount for form fields: the whole value must be a number (commas,
 * ¥/円 and spaces are ignored; full-width digits are accepted). Returns
 * undefined for empty or non-numeric input. Decimals are kept.
 */
export function parseAmountInput(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const s = raw
    .normalize('NFKC')
    .replace(/[,\s¥円]/g, '')
    .replace(/^[−▲△]/, '-');
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "name:amount, …" → item lines (empty input → []). Negative amounts are kept. */
export function parseItemsText(text: string | null | undefined): ItemLine[] {
  if (!text) return [];
  return stripThousands(text.replace(/\r/g, ''))
    .split(/[\n,、]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*)[:：=]([^:：=]*)$/);
      const name = (m ? m[1] : p).trim();
      const amount = m ? (parseYen(m[2]) ?? 0) : 0;
      return { name: (name || '不明').slice(0, 500), amount };
    });
}

/** Item lines → "name:amount, …" (an amount of 0 is omitted unless the name contains a separator). */
export function formatItemsText(lines: ReadonlyArray<{ name?: string | null; amount?: number | null }>): string {
  return lines
    .map((l) => {
      // 区切り文字を名前から除き、parseItemsText で元に戻せるようにする
      const name = String(l.name ?? '')
        .replace(/\s*[\r\n,、]+\s*/g, ' ')
        .trim();
      if (!name) return '';
      // ":0" is kept when the name itself contains a separator ("Type:C"),
      // otherwise parseItemsText would split the name.
      if (!l.amount) return /[:：=]/.test(name) ? `${name}:0` : name;
      return `${name}:${l.amount}`;
    })
    .filter(Boolean)
    .join(', ');
}

/** Item-like objects from OCR results or the legacy Expense.items JSON → item lines. */
export function itemsFromJson(value: unknown): ItemLine[] {
  if (!Array.isArray(value)) return [];
  const out: ItemLine[] = [];
  for (const it of value as Array<Record<string, unknown> | null>) {
    const name = String(it?.name ?? it?.description ?? it?.item ?? '').trim();
    if (!name) continue;
    const amount = parseYen(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice) ?? 0;
    out.push({ name: name.slice(0, 500), amount });
  }
  return out;
}

/** Display text of an expense's items: ExpenseItem rows first, legacy JSON as fallback. */
export function expenseItemsText(e: {
  lineItems?: ReadonlyArray<{ name: string; amount: number }> | null;
  items?: unknown;
}): string {
  if (e.lineItems?.length) return formatItemsText(e.lineItems);
  return formatItemsText(itemsFromJson(e.items));
}

/** Item lines → ExpenseItem create data (without expenseId). */
export function toExpenseItemData(lines: ReadonlyArray<ItemLine>) {
  return lines.map((l) => ({ name: l.name.slice(0, 500), qty: 1, unitPrice: l.amount, amount: l.amount, taxRate: 10 }));
}

/** Structured items ({ name, qty, price, total } as sent to /api/expenses) → ExpenseItem create data. */
export function toLineItemCreateData(
  items: ReadonlyArray<{ name?: string | null; qty?: number | null; price?: number | null; total?: number | null }>,
) {
  return items
    .filter((it) => String(it.name ?? '').trim())
    .map((it) => {
      const qty = Math.max(1, Math.round(it.qty ?? 1));
      const unitPrice = Math.round(it.price ?? it.total ?? 0);
      const amount = Math.round(it.total ?? (it.price ?? 0) * qty);
      return { name: String(it.name).trim().slice(0, 500), qty, unitPrice, amount, taxRate: 10 };
    });
}

/** Stable order for reading ExpenseItem rows back (insertion order). */
export const lineItemsOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
