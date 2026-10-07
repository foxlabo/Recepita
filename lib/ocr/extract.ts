// lib/ocr/extract.ts
// Pure helpers turning /api/ocr responses into draft rows (browser-side).
// Moved out of components/BulkRegisterPage.tsx without behavioural changes,
// except that dates are normalised with lib/dates (JST).
import { normalizeDateString, todayJST } from '@/lib/dates';

/** One analysed file / PDF page. */
export type OcrPage = {
  key: string;
  groupKey: string;
  raw: any;
  text: string;
  detected: any;
  ai: any;
};

/** Values extracted for one draft row. */
export type OcrDraftRow = {
  date: string;
  amount: number;
  vendor: string;
  category?: string;
  memo?: string;
  itemsText?: string;
};

export const isNum = (x: any): x is number => typeof x === 'number' && Number.isFinite(x);

export const sumArray = (arr: any[]): number | undefined => {
  const nums = arr.filter(isNum) as number[];
  return nums.length ? nums.reduce((a, b) => a + b, 0) : undefined;
};

/** Unwrap an OCR/AI response that may be nested or JSON-encoded as a string. */
export function unwrapOcrResponse(raw: any): any {
  let c: any = raw?.message?.content ?? raw?.choices?.[0]?.message?.content ?? raw?.content ?? raw;
  for (let i = 0; i < 3; i++) {
    if (typeof c === 'string') {
      const t = c.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try {
          c = JSON.parse(t);
          continue;
        } catch {}
      }
      break;
    }
  }
  return c;
}

/** OCR / テキストの日付 → 'YYYY-MM-DD'（解釈できなければ undefined） */
export const toDateStr = (v: unknown): string | undefined => normalizeDateString(v);

/** "1,234円" / "¥1234" → 1234 (undefined when not numeric). */
export function toNum(v: any): number | undefined {
  if (v == null) return;
  const n = Number(String(v).replace(/[,￥¥円\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function extractDateFromText(text?: string): string | undefined {
  if (!text) return;
  let m = text.match(/注文日[：:]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
  if (m) return toDateStr(m[1]);
  m = text.match(/(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
  if (m) return toDateStr(m[1]);
  m = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m) return `${m[1]}-${(`0${m[2]}`).slice(-2)}-${(`0${m[3]}`).slice(-2)}`;
  return;
}

/**
 * 「税込」「合計 ○○円」や、最大金額を拾って税込っぽい値を推定
 */
export function pickGrossFromText(text?: string, fallback?: number): number | undefined {
  if (!text) return fallback;
  const t = text.replace(/\s+/g, ' ');

  // 請求書系: ご請求金額 / 請求金額 / 請求額 など
  let m =
    t.match(/ご?請求(?:金額|額)[：:]?\s*(?:税込)?\s*[¥￥]?(\d[\d,]*)/) ||
    t.match(/請求合計[：:]?\s*(?:税込)?\s*[¥￥]?(\d[\d,]*)/);
  if (m) return toNum(m[1]);

  // ① 「税込 ～」「合計 ～」を優先
  m = t.match(/税込[：:]?\s*[¥￥]?(\d[\d,]*)/);
  if (m) return toNum(m[1]);

  m = t.match(/合計[：:]?\s*(?:金額[：:]?\s*)?[¥￥]?(\d[\d,]*)/);
  if (m) {
    const v = toNum(m[1]);
    if (v != null && (fallback == null || v > fallback)) return v;
  }

  // ② 最後の保険：テキスト内に出てくる金額の最大値を使う
  const re = /[¥￥]?\s*(\d[\d,]{2,})/g; // 3桁以上
  let maxVal: number | undefined;
  for (const match of t.matchAll(re)) {
    const v = toNum(match[1]);
    if (v != null && (!maxVal || v > maxVal)) {
      maxVal = v;
    }
  }
  if (maxVal != null && (fallback == null || maxVal > fallback)) {
    return maxVal;
  }

  return fallback;
}

/**
 * テキストから「小計」「税額」を抽出して subtotal / tax を推定
 */
export function pickSubtotalAndTaxFromText(text?: string): { subtotal?: number; tax?: number } {
  if (!text) return {};
  const t = text.replace(/\s+/g, ' ');

  const subMatch = t.match(/小計[：:]?\s*[¥￥]?(\d[\d,]*)/);
  const subtotal = subMatch ? toNum(subMatch[1]) : undefined;

  const taxMatch = t.match(/(税額|消費税)[：:]?\s*[¥￥]?(\d[\d,]*)/);
  const tax = taxMatch ? toNum(taxMatch[2]) : undefined;

  return { subtotal, tax };
}

/** "invoice_p2.pdf" → "invoice.pdf" (pages produced by splitPdfToFiles). */
export function baseKeyOf(name: string): string {
  const m = name.match(/^(.*)_p\d+\.pdf$/i);
  if (m) return `${m[1]}.pdf`;
  return name;
}

/** Response of /api/ocr (or a failure) → OcrPage. */
export function toOcrPage(fileName: string, result: { raw: unknown } | { error: string }): OcrPage {
  if ('error' in result) {
    return {
      key: fileName,
      groupKey: baseKeyOf(fileName),
      raw: { error: result.error },
      text: '',
      detected: {},
      ai: {},
    };
  }
  const p = unwrapOcrResponse(result.raw);
  return {
    key: fileName,
    groupKey: baseKeyOf(fileName),
    raw: p,
    text: p?.ocrText ?? '',
    detected: p?.detected ?? {},
    ai: p?.ai ?? {},
  };
}

/**
 * 1ページ=1行モード用：
 *  - Azure の detected.amount（請求総額）を最優先
 *  - その次に subtotal+tax / total
 *  - それでもダメなら明細やテキスト
 */
export function mapPerPage(page: OcrPage): OcrDraftRow {
  const today = todayJST();
  const p = page.raw;
  const d = page.detected ?? {};
  const ai = page.ai ?? {};

  const date = toDateStr(d.date ?? p.date) ?? extractDateFromText(page.text) ?? today;
  const vendor = (typeof d.vendor === 'string' ? d.vendor : undefined) ?? p.vendor ?? '';

  // --- 品目系 ---
  let firstItemAmt: number | undefined;
  if (Array.isArray(d.items) && d.items.length) {
    const it = d.items[0];
    firstItemAmt = toNum(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice);
  }
  const sumItems = sumArray(
    (Array.isArray(d.items) ? d.items : []).map((it: any) =>
      toNum(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice),
    ),
  );

  // --- テキストから subtotal / tax / gross を推定 ---
  const { subtotal: textSubtotal, tax: textTax } = pickSubtotalAndTaxFromText(page.text);
  const textGross = pickGrossFromText(page.text); // fallback なし

  // --- 構造化データからの金額 ---
  const amountField = toNum(d.amount ?? p.amount); // Azure の Total はここに入ってくる
  const total = toNum(d.total ?? p.total); // 他のプロバイダ用の保険
  const subtotal = toNum(d.subtotal ?? p.subtotal) ?? textSubtotal;
  const tax = toNum(d.tax ?? p.tax) ?? textTax;

  // 優先順位：
  // 1) detected.amount（請求総額＝税込想定）
  // 2) subtotal + tax
  // 3) total
  // 4) 明細からの金額
  // 5) テキストから拾った「ご請求金額」「合計（税込）」など（fallback に subtotal / total / amountField）
  const amount =
    amountField ??
    (isNum(subtotal) && isNum(tax) ? subtotal + tax : undefined) ??
    total ??
    firstItemAmt ??
    sumItems ??
    pickGrossFromText(page.text, subtotal ?? total ?? amountField ?? textGross) ??
    textGross ??
    0;

  let name: string | undefined;
  if (Array.isArray(d.items) && d.items.length) {
    const it = d.items[0];
    name = it?.name ?? it?.description ?? it?.item ?? undefined;
  }
  if (!name) name = p.itemsSummary;

  return {
    date,
    amount,
    vendor,
    category: ai.category ?? p.category,
    memo: ai.memo ?? p.memo,
    itemsText: name,
  };
}

/**
 * 1ファイル=1行モード用：複数ページをまとめて税込金額を推定
 */
export function mapAggregate(pages: OcrPage[]): OcrDraftRow {
  const today = todayJST();
  const texts = pages.map((p) => p.text).join('\n');

  const dates = pages
    .map((p) => toDateStr(p.detected?.date ?? p.raw?.date) ?? extractDateFromText(p.text))
    .filter((x): x is string => !!x);
  const date = dates.length ? dates.sort()[0] : today;

  const vendors = pages
    .map((p) => (typeof p.detected?.vendor === 'string' ? p.detected?.vendor : undefined) ?? p.raw?.vendor)
    .filter((x): x is string => !!x);
  const vendor = vendors[0] ?? '';

  const allItems = pages.flatMap((p) => (Array.isArray(p.detected?.items) ? p.detected.items : []));
  const sumItemTotals =
    sumArray(allItems.map((it: any) => toNum(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice))) ?? 0;

  const totals = pages.map((p) => toNum(p.detected?.amount ?? p.detected?.total ?? p.raw?.amount ?? p.raw?.total));
  const subTotals = pages.map((p) => toNum(p.detected?.subtotal ?? p.raw?.subtotal));
  const taxes = pages.map((p) => toNum(p.detected?.tax ?? p.raw?.tax));

  const totalSum = sumArray(totals);
  const subSum = sumArray(subTotals);
  const taxSum = sumArray(taxes);

  const textAmounts = pickSubtotalAndTaxFromText(texts);
  const textGross = pickGrossFromText(texts);

  const amount =
    (totalSum != null ? totalSum : undefined) ??
    (subSum != null && taxSum != null ? subSum + taxSum : undefined) ??
    (sumItemTotals || undefined) ??
    pickGrossFromText(
      texts,
      (textAmounts.subtotal != null && textAmounts.tax != null ? textAmounts.subtotal + textAmounts.tax : subSum) ??
        undefined,
    ) ??
    textGross ??
    0;

  let itemsText: string | undefined;
  if (allItems.length) {
    const names = allItems.map((it: any) => it?.name ?? it?.description ?? it?.item).filter((x): x is string => !!x);
    const joined = names.join(', ');
    itemsText = joined.length > 140 ? `${joined.slice(0, 140)}…` : joined;
  }

  return {
    date,
    amount,
    vendor,
    category: pages[0]?.ai?.category,
    memo: pages[0]?.ai?.memo,
    itemsText,
  };
}

/** Group pages per mode and map them to draft rows; failed pages / files are skipped. */
export function pagesToDraftRows(pages: OcrPage[], mode: 'perPage' | 'aggregate'): OcrDraftRow[] {
  const out: OcrDraftRow[] = [];
  if (mode === 'perPage') {
    for (const p of pages) {
      if (p.raw?.error) continue;
      out.push(mapPerPage(p));
    }
    return out;
  }
  const groups = new Map<string, OcrPage[]>();
  for (const p of pages) groups.set(p.groupKey, [...(groups.get(p.groupKey) ?? []), p]);
  for (const arr of groups.values()) {
    if (arr.some((p) => p.raw?.error)) continue;
    out.push(mapAggregate(arr));
  }
  return out;
}
