// lib/draft-import.ts
// Client-side mapping of imported data (CSV rows, OCR results) to the draft
// payload accepted by POST /api/expense-drafts(/bulk). The server validates
// and normalises again (lib/drafts.ts), so values that cannot be interpreted
// here are passed through and rejected there with a message.
import { normalizeDateString } from '@/lib/dates';
import { parseYen } from '@/lib/items';
import { parseCsv } from '@/lib/csv';
import type { OcrDraftRow } from '@/lib/ocr/extract';

/** Body of one draft for POST /api/expense-drafts and /api/expense-drafts/bulk. */
export type DraftPayload = {
  /** 登録日（省略時はサーバーの現在時刻） */
  registeredDate?: string;
  /** 取引日 'YYYY-MM-DD' */
  tradeDate: string;
  /** 円。数値に解釈できない場合は NaN（JSON では null → サーバーで 400） */
  amount: number;
  vendor: string;
  category: string;
  memo: string;
  itemsSummary: string;
};

/** Header names that identify the header row of an imported CSV. */
export const DRAFT_CSV_HEADERS = [
  '登録日',
  '取引日',
  '日付',
  '金額',
  '取引先',
  '区分',
  '品目',
  'メモ',
  'vendor',
  'amount',
  'category',
  'items',
  'itemsSummary',
  '明細',
  'memo',
  '備考',
  'レシートタイプ',
  '添付ファイル',
] as const;

/** One CSV record → draft payload (column names matched exactly, then by substring). */
export function coerceDraftFromCsv(rec: Record<string, string>): DraftPayload {
  const keys = Object.keys(rec);

  const find = (candidates: string[]) => {
    // 完全一致優先
    for (const c of candidates) {
      if (c in rec && rec[c] !== '') return rec[c];
    }
    // 部分一致（"請求金額（税込）" など）
    for (const c of candidates) {
      const hitKey = keys.find((k) => k.includes(c));
      if (hitKey && rec[hitKey] !== '') return rec[hitKey];
    }
    return '';
  };

  const registeredRaw = find(['登録日', 'registeredDate']);
  const tradeRaw = find(['取引日', '日付', 'date', 'tradeDate']);

  // 金額：請求書パターンを優先して拾う
  const amountRaw = find([
    '税込金額',
    '税込金額円',
    'ご請求金額',
    '請求金額',
    'ご請求額',
    '請求額',
    '合計金額',
    '合計（税込）',
    '合計',
    '金額',
    'amount',
  ]);

  return {
    registeredDate: registeredRaw ? (normalizeDateString(registeredRaw) ?? registeredRaw) : undefined,
    // 解釈できない日付はそのまま送り、サーバーが「N件目: 取引日は…」と返す
    tradeDate: normalizeDateString(tradeRaw) ?? tradeRaw,
    amount: amountRaw ? (parseYen(amountRaw) ?? Number.NaN) : 0,
    vendor: find(['取引先', 'vendor', '相手先', '宛先', '宛名']),
    // 区分：レシートタイプ系も拾う
    category: find(['区分', 'レシートタイプ', 'receiptType', 'category']),
    itemsSummary: find(['品目', 'items', 'itemsSummary', '明細']),
    memo: find(['メモ', 'memo', '備考', '摘要']),
  };
}

/** CSV text → draft payloads. */
export function draftsFromCsv(text: string): DraftPayload[] {
  return parseCsv(text, DRAFT_CSV_HEADERS).map(coerceDraftFromCsv);
}

/** OCR draft row → draft payload (登録日はサーバー側で付与). */
export function draftFromOcrRow(r: OcrDraftRow): DraftPayload {
  return {
    tradeDate: r.date,
    amount: Number(r.amount ?? 0),
    vendor: r.vendor ?? '',
    category: r.category ?? '',
    memo: r.memo ?? '',
    itemsSummary: r.itemsText ?? '',
  };
}
