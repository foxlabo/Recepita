'use client';
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { normalizeDateString, todayJST } from '@/lib/dates';

function parseCsv(text: string): Record<string, string>[] {
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

  // よく使いそうなヘッダー名を列挙（これが含まれている行をヘッダーとみなす）
  const knownHeaderNames = [
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
  ];

  // 一番それっぽいヘッダー行を探す（見つからなければ先頭行をヘッダーとする）
  let headerLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const cells = toCells(lines[i]).map((c) => c.trim());
    const hasKnownHeader = cells.some((c) => knownHeaderNames.includes(c));
    if (hasKnownHeader) {
      headerLineIndex = i;
      break;
    }
  }

  const header = toCells(lines[headerLineIndex]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = toCells(lines[i]);
    // 全セル空ならスキップ
    if (cells.every((c) => c.trim() === '')) continue;

    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = (cells[idx] ?? '').trim();
    });
    rows.push(rec);
  }

  return rows;
}

function coerceDraftFromCsv(rec: Record<string, string>) {
  const keys = Object.keys(rec);

  // まずは完全一致 → だめなら「ヘッダー名の部分一致」で拾う
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

  const today = todayJST();

  const registeredDate = find(['登録日', 'registeredDate']) || today;

  const tradeDate = find(['取引日', '日付', 'date', 'tradeDate']);

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
  const amount = amountRaw
    ? Number(String(amountRaw).replace(/[^\d.-]/g, ''))
    : 0;

  const vendor = find(['取引先', 'vendor', '相手先', '宛先', '宛名']);

  // 区分：レシートタイプ系も拾う
  const category = find(['区分', 'レシートタイプ', 'receiptType', 'category']);

  const itemsSummary = find(['品目', 'items', 'itemsSummary', '明細']);

  const memo = find(['メモ', 'memo', '備考', '摘要']);

  return { registeredDate, tradeDate, amount, vendor, category, itemsSummary, memo };
}

const OCR_ENDPOINT = '/api/ocr';
const FILE_FIELD = 'file';

type PreviewRow = {
  id: string;
  groupKey: string;
  fileName: string;
  createdAt: string;
  date?: string;
  amount?: number;
  vendor?: string;
  category?: string;
  itemsText?: string;
  memo?: string;
  error?: string;
};

type OcrModel = 'prebuilt-receipt' | 'invoice' | 'auto';
type Mode = 'perPage' | 'aggregate';

type OcrPage = {
  key: string;
  groupKey: string;
  raw: any;
  text: string;
  detected: any;
  ai: any;
};

async function callOcrSingle(file: File, model: string) {
  const fd = new FormData();
  fd.append(FILE_FIELD, file, file.name);
  fd.append('model', model);

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const parseRetryAfter = (h?: string | null) => {
    if (!h) return 0;
    const n = Number(h);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n * 1000));
    const d = Date.parse(h);
    return Number.isNaN(d) ? 0 : Math.max(0, d - Date.now());
  };

  let lastErr: any;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(OCR_ENDPOINT, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
      });
      if (res.status === 429) {
        const ra = parseRetryAfter(res.headers.get('retry-after'));
        await sleep(Math.max(ra, 800 * (i + 1)));
        continue;
      }
      if (!res.ok)
        throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

const isNum = (x: any): x is number =>
  typeof x === 'number' && Number.isFinite(x);

const sumArray = (arr: any[]): number | undefined => {
  const nums = arr.filter(isNum) as number[];
  return nums.length ? nums.reduce((a, b) => a + b, 0) : undefined;
};

function normalize(raw: any): any {
  let c: any =
    raw?.message?.content ??
    raw?.choices?.[0]?.message?.content ??
    raw?.content ??
    raw;
  for (let i = 0; i < 3; i++) {
    if (typeof c === 'string') {
      const t = c.trim();
      if (
        (t.startsWith('{') && t.endsWith('}')) ||
        (t.startsWith('[') && t.endsWith(']'))
      ) {
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
const toDateStr = (v: unknown): string | undefined => normalizeDateString(v);
function toNum(v: any): number | undefined {
  if (v == null) return;
  const n = Number(String(v).replace(/[,￥¥円\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
function extractDateFromText(text?: string): string | undefined {
  if (!text) return;
  let m = text.match(/注文日[：:]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  if (m) return toDateStr(m[1]);
  m = text.match(/(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  if (m) return toDateStr(m[1]);
  m = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m)
    return `${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}`;
  return;
}

/**
 * 「税込」「合計 ○○円」や、最大金額を拾って税込っぽい値を推定
 */
function pickGrossFromText(
  text?: string,
  fallback?: number,
): number | undefined {
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
function pickSubtotalAndTaxFromText(
  text?: string,
): { subtotal?: number; tax?: number } {
  if (!text) return {};
  const t = text.replace(/\s+/g, ' ');

  const subMatch = t.match(/小計[：:]?\s*[¥￥]?(\d[\d,]*)/);
  const subtotal = subMatch ? toNum(subMatch[1]) : undefined;

  const taxMatch = t.match(/(税額|消費税)[：:]?\s*[¥￥]?(\d[\d,]*)/);
  const tax = taxMatch ? toNum(taxMatch[2]) : undefined;

  return { subtotal, tax };
}

function baseKeyOf(name: string): string {
  const m = name.match(/^(.*)_p\d+\.pdf$/i);
  if (m) return m[1] + '.pdf';
  return name;
}

/**
 * 1ページ=1行モード用：
 *  - Azure の detected.amount（請求総額）を最優先
 *  - その次に subtotal+tax / total
 *  - それでもダメなら明細やテキスト
 */
function mapPerPage(page: OcrPage): PreviewRow {
  const today = todayJST();
  const p = page.raw;
  const d = page.detected ?? {};
  const ai = page.ai ?? {};

  const date =
    toDateStr(d.date ?? p.date) ?? extractDateFromText(page.text) ?? today;
  const vendor =
    (typeof d.vendor === 'string' ? d.vendor : undefined) ?? p.vendor ?? '';

  // --- 品目系 ---
  let firstItemAmt: number | undefined = undefined;
  if (Array.isArray(d.items) && d.items.length) {
    const it = d.items[0];
    firstItemAmt = toNum(
      it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice,
    );
  }
  const sumItems = sumArray(
    (Array.isArray(d.items) ? d.items : []).map((it: any) =>
      toNum(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice),
    ),
  );

  // --- テキストから subtotal / tax / gross を推定 ---
  const { subtotal: textSubtotal, tax: textTax } =
    pickSubtotalAndTaxFromText(page.text);
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
    pickGrossFromText(
      page.text,
      subtotal ?? total ?? amountField ?? textGross,
    ) ??
    textGross ??
    0;

  let name: string | undefined = undefined;
  if (Array.isArray(d.items) && d.items.length) {
    const it = d.items[0];
    name = it?.name ?? it?.description ?? it?.item ?? undefined;
  }
  if (!name) name = p.itemsSummary;

  return {
    id: crypto.randomUUID(),
    groupKey: page.groupKey,
    fileName: page.key,
    createdAt: new Date().toISOString(),
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
function mapAggregate(groupKey: string, pages: OcrPage[]): PreviewRow {
  const today = todayJST();
  const texts = pages.map((p) => p.text).join('\n');

  const dates = pages
    .map(
      (p) =>
        toDateStr(p.detected?.date ?? p.raw?.date) ??
        extractDateFromText(p.text),
    )
    .filter((x): x is string => !!x);
  const date = dates.length ? dates.sort()[0] : today;

  const vendors = pages
    .map(
      (p) =>
        (typeof p.detected?.vendor === 'string'
          ? p.detected?.vendor
          : undefined) ?? p.raw?.vendor,
    )
    .filter((x): x is string => !!x);
  const vendor = vendors[0] ?? '';

  const allItems = pages.flatMap((p) =>
    Array.isArray(p.detected?.items) ? p.detected!.items : [],
  );
  const sumItemTotals =
    sumArray(
      allItems.map((it: any) =>
        toNum(it?.total ?? it?.amount ?? it?.price ?? it?.unitPrice),
      ),
    ) ?? 0;

  const totals = pages.map((p) =>
    toNum(
      p.detected?.amount ??
        p.detected?.total ??
        p.raw?.amount ??
        p.raw?.total,
    ),
  );
  const subTotals = pages.map((p) =>
    toNum(p.detected?.subtotal ?? p.raw?.subtotal),
  );
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
      (textAmounts.subtotal != null && textAmounts.tax != null
        ? textAmounts.subtotal + textAmounts.tax
        : subSum) ?? undefined,
    ) ??
    textGross ??
    0;

  let itemsText: string | undefined = undefined;
  if (allItems.length) {
    const names = allItems
      .map((it: any) => it?.name ?? it?.description ?? it?.item)
      .filter((x): x is string => !!x);
    const joined = names.join(', ');
    itemsText = joined.length > 140 ? joined.slice(0, 140) + '…' : joined;
  }

  return {
    id: crypto.randomUUID(),
    groupKey,
    fileName: groupKey,
    createdAt: new Date().toISOString(),
    date,
    amount,
    vendor,
    category: pages[0]?.ai?.category,
    memo: pages[0]?.ai?.memo,
    itemsText,
  };
}

async function splitPdfToFiles(file: File): Promise<File[]> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const buf = await file.arrayBuffer();
    const srcPdf = await PDFDocument.load(buf);
    const pages = srcPdf.getPageCount();
    if (pages <= 1) return [file];
    const out: File[] = [];
    for (let i = 0; i < pages; i++) {
      const newPdf = await PDFDocument.create();
      const [copied] = await newPdf.copyPages(srcPdf, [i]);
      newPdf.addPage(copied);
      const bytes: Uint8Array = await newPdf.save();
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const base = (file.name ?? 'page').replace(/\.pdf$/i, '');
      const filename = `${base}_p${i + 1}.pdf`;
      const blob = new Blob([ab], { type: 'application/pdf' });
      let f: File;
      if (
        typeof window !== 'undefined' &&
        typeof (window as any).File === 'function'
      ) {
        f = new File([blob], filename, { type: 'application/pdf' });
      } else {
        (blob as any).name = filename;
        f = blob as any;
      }
      out.push(f);
    }
    return out;
  } catch {
    return [file];
  }
}

async function extractFilesFromDataTransfer(
  dt: DataTransfer,
): Promise<File[]> {
  const out: File[] = [];
  const items = Array.from(dt.items ?? []);
  if (items.length) {
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  if (!out.length) {
    out.push(...Array.from(dt.files ?? []));
  }
  return out;
}

type BulkProps = {
  drafts?: any[];
  onAppendDraft?: (row: any) => void;
  onDeleteDraft?: (i: number) => void;
  onFinalize?: () => void;
  onClearDrafts?: () => void;
};

export default function BulkRegisterPage({
  drafts = [],
  onAppendDraft = () => {},
  onDeleteDraft = () => {},
  onFinalize = () => {},
  onClearDrafts = () => {},
}: BulkProps) {
  const [model, setModel] = useState<OcrModel>('prebuilt-receipt');
  const [target, setTarget] = useState<'expense' | 'invoice'>('expense'); // いまは未使用
  const [mode, setMode] = useState<Mode>('perPage');
  const [files, setFiles] = useState<File[]>([]);
  const previews = useMemo(
    () =>
      files.map((f, idx) => ({
        key: `${f.name}-${f.size}-${f.lastModified}-${idx}`,
        url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : '',
        name: f.name,
        size: f.size,
        type: f.type || '',
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      try {
        previews.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      } catch {}
    };
  }, [previews]);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState<'idle' | 'parsing' | 'posting'>('idle');
  const statusText = useMemo(
    () => ({ idle: '', parsing: '解析中…', posting: '登録中…' }[busy]),
    [busy],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const expandFiles = async (list: File[]) => {
    const expanded: File[] = [];
    for (const f of list) {
      if (f.type === 'application/pdf') {
        const parts = await splitPdfToFiles(f);
        expanded.push(...parts);
      } else {
        expanded.push(f);
      }
    }
    return expanded;
  };

  const onPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(ev.target.files ?? []);
    if (!selected.length) return;
    const expanded = await expandFiles(selected);
    setFiles((prev) => [...prev, ...expanded]);
  };

  const onDrop = useCallback(async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    const dropped = await extractFilesFromDataTransfer(ev.dataTransfer);
    if (!dropped.length) return;
    const expanded = await expandFiles(dropped);
    setFiles((prev) => [...prev, ...expanded]);
  }, []);

  const onDragOver = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onDragEnter = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onPickCsv = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const records = parseCsv(text);
    const today = todayJST();
    records.forEach((r) => {
      const d = coerceDraftFromCsv(r);
      if (!d.registeredDate) d.registeredDate = today;
      onAppendDraft(d);
    });
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const onClickCsvImport = () => csvInputRef.current?.click();

  const clear = () => {
    setFiles([]);
    setRows([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    try {
      const p = previews[idx];
      if (p && p.url) URL.revokeObjectURL(p.url);
    } catch {}
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const parseAllWithThrottle = async () => {
    if (!files.length) return alert('ファイルを選択してください');
    setBusy('parsing');
    const pages: OcrPage[] = [];
    try {
      for (const f of files) {
        await sleep(600);
        try {
          const raw = await callOcrSingle(f, model);
          const p = normalize(raw);
          const d = p?.detected ?? {};
          const ai = p?.ai ?? {};
          pages.push({
            key: f.name,
            groupKey: baseKeyOf(f.name),
            raw: p,
            text: p?.ocrText ?? '',
            detected: d,
            ai,
          });
        } catch (e: any) {
          pages.push({
            key: f.name,
            groupKey: baseKeyOf(f.name),
            raw: { error: e?.message ?? 'OCR failed' },
            text: '',
            detected: {},
            ai: {},
          });
        }
      }

      const out: PreviewRow[] = [];
      if (mode === 'perPage') {
        for (const p of pages) {
          if (p.raw?.error) continue;
          out.push(mapPerPage(p));
        }
      } else {
        const groups = new Map<string, OcrPage[]>();
        for (const p of pages) {
          const k = p.groupKey;
          groups.set(k, [...(groups.get(k) ?? []), p]);
        }
        for (const [k, arr] of groups) {
          if (arr.some((p) => p.raw?.error)) continue;
          out.push(mapAggregate(k, arr));
        }
      }

      try {
        const today = todayJST();
        out.forEach((r) =>
          onAppendDraft({
            registeredDate: today,
            tradeDate: r.date,
            amount: Number(r.amount ?? 0),
            vendor: r.vendor ?? '',
            category: r.category ?? '',
            memo: r.memo ?? '',
            itemsSummary: r.itemsText ?? '',
          }),
        );
      } catch {}

      setRows([]);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent
          className="p-6"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
        >
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            className="border-2 border-dashed rounded-xl p-8 text-center text-sm text-(--muted)"
          >
            ここにファイルをドラッグ&ドロップ（複数可）／PDFも可（複数ページPDFは自動でページ分割）
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input ref={inputRef} type="file" multiple onChange={onPick} />

              <div className="flex items-center gap-2">
                <span>形式</span>
                <select
                  className="border rounded-sm px-2 py-1"
                  value={model}
                  onChange={(e) => setModel(e.target.value as OcrModel)}
                >
                  <option value="prebuilt-receipt">レシート</option>
                  <option value="invoice">請求書</option>
                  <option value="auto">auto</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span>モード</span>
                <select
                  className="border rounded-sm px-2 py-1"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                >
                  <option value="perPage">ページごとに分割（ページ=1行）</option>
                  <option value="aggregate">1ファイルに集計（1行）</option>
                </select>
              </div>

              <Button
                size="md"
                onClick={parseAllWithThrottle}
                disabled={!files.length || busy !== 'idle'}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                解析
              </Button>
              <span className="text-(--muted)">状態: {statusText}</span>
            </div>
          </div>

          {files.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-(--muted) mb-2">
                追加済みファイル（{files.length}）
              </div>
              <div className="flex flex-wrap gap-3">
                {previews.map((p, idx) => (
                  <div
                    key={p.key}
                    className="relative border rounded-lg p-2 pr-8 flex items-center gap-2 bg-white shadow-xs"
                  >
                    {p.url ? (
                      <img
                        src={p.url}
                        alt=""
                        className="w-10 h-10 object-cover rounded-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-sm bg-(--muted-bg) grid place-items-center text-lg">
                        📄
                      </div>
                    )}
                    <div className="text-xs">
                      <div
                        className="font-medium truncate max-w-[200px]"
                        title={p.name}
                      >
                        {p.name}
                      </div>
                      <div className="text-(--muted)">
                        {Math.max(1, Math.round(p.size / 1024))}KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-300 hover:bg-gray-400 text-xs leading-5 text-white shadow-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button
              size="md"
              onClick={onClickCsvImport}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              CSVインポート
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={onPickCsv}
              hidden
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-2">
        <CardHeader className="p-4 border-b border-(--border) flex items-center justify-between">
          <div>下書き</div>
          <div className="flex items-center gap-2">
            <Button size="md" variant="outline" onClick={onClearDrafts}>
              クリア
            </Button>
            <Button size="md" onClick={onFinalize}>
              登録
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-(--border) rounded-lg overflow-hidden">
              <thead className="bg-(--muted-bg) border-b border-(--border)">
                <tr className="text-left">
                  <th className="p-2">登録日</th>
                  <th className="p-2">取引日</th>
                  <th className="p-2 text-right">金額</th>
                  <th className="p-2">取引先</th>
                  <th className="p-2">区分</th>
                  <th className="p-2">品目</th>
                  <th className="p-2">メモ</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {(drafts ?? []).map((x, i) => (
                  <tr key={i} className="border-b border-(--border)">
                    <td className="p-2 whitespace-nowrap">
                      {x.registeredDate}
                    </td>
                    <td className="p-2 whitespace-nowrap">{x.tradeDate}</td>
                    <td className="p-2 text-right">
                      {Number(x.amount).toLocaleString()}
                    </td>
                    <td className="p-2">{x.vendor}</td>
                    <td className="p-2">{x.category || '-'}</td>
                    <td
                      className="p-2 max-w-[360px] truncate"
                      title={x.itemsSummary || ''}
                    >
                      {x.itemsSummary || '-'}
                    </td>
                    <td className="p-2">{x.memo || ''}</td>
                    <td className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => onDeleteDraft(i)}
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
                {(!drafts || drafts.length === 0) && (
                  <tr>
                    <td colSpan={8} className="p-3 text-(--muted)">
                      下書きなし
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
