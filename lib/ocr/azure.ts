import type { OcrProvider, OcrResult } from './adapter';

const API_VERSION = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || '2023-07-31';
const ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

if (!ENDPOINT) console.warn('[Azure OCR] Missing AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
if (!KEY) console.warn('[Azure OCR] Missing AZURE_DOCUMENT_INTELLIGENCE_KEY');

type LogicalModel = 'receipt' | 'invoice';

/**
 * Provider failure. The message is short and never contains the provider's
 * response body; `status` / `retryAfter` drive the caller's retry logic.
 */
export class OcrProviderError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

function buildModelUrl(logical: LogicalModel) {
  const name = logical === 'invoice' ? 'prebuilt-invoice' : 'prebuilt-receipt';
  return `${ENDPOINT}/formrecognizer/documentModels/${name}:analyze?api-version=${API_VERSION}`;
}

async function analyzeWithModel(buffer: Buffer, mimeType = 'application/octet-stream', logicalModel: LogicalModel) {
  if (!ENDPOINT || !KEY) throw new OcrProviderError('[Azure OCR] not configured');
  const url = buildModelUrl(logicalModel);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    // Do not log or propagate the provider's response body.
    await res.body?.cancel().catch(() => {});
    throw new OcrProviderError(
      `[Azure OCR] analyze POST failed: HTTP ${res.status}`,
      res.status,
      res.headers.get('retry-after'),
    );
  }

  const operationLocation = res.headers.get('operation-location');
  if (!operationLocation) throw new OcrProviderError('[Azure OCR] missing operation-location header');
  // Only ever send the subscription key back to the configured endpoint.
  if (new URL(operationLocation).origin !== new URL(ENDPOINT).origin)
    throw new OcrProviderError('[Azure OCR] unexpected operation-location origin');

  let tries = 0;
  while (tries++ < 20) {
    await new Promise((r) => setTimeout(r, 1000));
    const r2 = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': KEY },
    });
    if (!r2.ok) {
      await r2.body?.cancel().catch(() => {});
      throw new OcrProviderError(
        `[Azure OCR] poll failed: HTTP ${r2.status}`,
        r2.status,
        r2.headers.get('retry-after'),
      );
    }
    const j = await r2.json();
    if (j.status === 'succeeded') return j;
    if (j.status === 'failed') throw new OcrProviderError('[Azure OCR] analyze failed');
  }
  throw new OcrProviderError('[Azure OCR] analyze timed out', 504);
}

function asNumber(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(
    String(v)
      .replace(/[,\s]/g, '')
      .replace(/[￥¥円]/g, ''),
  );
  return Number.isFinite(n) ? n : undefined;
}

const isNum = (x: any): x is number => typeof x === 'number' && Number.isFinite(x);

const sumArray = (arr: Array<number | undefined>): number | undefined => {
  const xs = arr.filter(isNum) as number[];
  return xs.length ? xs.reduce((a, b) => a + b, 0) : undefined;
};

function normDate(s?: string): string | undefined {
  if (!s) return;
  const m = s.match(/(20\d{2})[-\/\.](0?[1-9]|1[0-2])[-\/\.](0?[1-9]|[12]\d|3[01])/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s;
}

function buildOcrText(result: any): string {
  try {
    const paras = result?.analyzeResult?.paragraphs ?? [];
    return paras.map((p: any) => p.content).join('\n');
  } catch {
    return '';
  }
}

// ------------------ レシートモデル用パーサ ------------------
function parseReceiptDoc(result: any): OcrResult {
  const doc = result?.analyzeResult?.documents?.[0];
  const fields = doc?.fields || {};

  const merchant = fields.MerchantName?.valueString || fields.MerchantName?.content;
  const dateRaw = fields.TransactionDate?.valueDate || fields.TransactionDate?.content;

  const total = asNumber(fields.Total?.valueNumber ?? fields.Total?.content);
  const subtotal = asNumber(fields.Subtotal?.valueNumber ?? fields.Subtotal?.content);
  const tax = asNumber(fields.Tax?.valueNumber ?? fields.Tax?.content);

  const items: Array<{
    name?: string;
    qty?: number;
    price?: number;
    total?: number;
  }> = [];

  const arr = fields.Items?.valueArray ?? [];
  for (const it of arr) {
    const f = it.valueObject || {};
    items.push({
      name: f.Description?.valueString || f.Description?.content,
      qty: asNumber(f.Quantity?.valueNumber ?? f.Quantity?.content),
      price: asNumber(f.UnitPrice?.valueNumber ?? f.UnitPrice?.content),
      total: asNumber(f.TotalPrice?.valueNumber ?? f.TotalPrice?.content),
    });
  }

  const sumItemTotals = sumArray(items.map((i) => i.total));
  // 税込金額の推定（Total 優先）
  const grossAmount = total ?? (isNum(subtotal) && isNum(tax) ? subtotal + tax : undefined) ?? sumItemTotals;

  return {
    ocrText: buildOcrText(result),
    detected: {
      date: normDate(dateRaw),
      amount: grossAmount,
      vendor: merchant,
      items,
      tax,
      subtotal,
    },
  };
}

// ------------------ インボイスモデル用パーサ ------------------
function parseInvoiceDoc(result: any): OcrResult {
  const doc = result?.analyzeResult?.documents?.[0];
  const fields = doc?.fields || {};

  const vendor = fields.VendorName?.valueString || fields.VendorName?.content;

  const dateRaw = fields.InvoiceDate?.valueDate || fields.InvoiceDate?.content;

  // InvoiceTotal は currency 型が多い
  const invoiceTotalCurrency = fields.InvoiceTotal?.valueCurrency;
  const invoiceTotal =
    asNumber(invoiceTotalCurrency?.amount) ||
    asNumber(fields.InvoiceTotal?.valueNumber ?? fields.InvoiceTotal?.content);

  const subTotal = asNumber(fields.SubTotal?.valueNumber ?? fields.SubTotal?.content);
  const totalTax = asNumber(fields.TotalTax?.valueNumber ?? fields.TotalTax?.content);

  const items: Array<{
    name?: string;
    qty?: number;
    price?: number;
    total?: number;
  }> = [];

  const arr = fields.Items?.valueArray ?? [];
  for (const it of arr) {
    const f = it.valueObject || {};
    const unitPriceCurrency = f.UnitPrice?.valueCurrency;

    const unitPrice = asNumber(unitPriceCurrency?.amount) || asNumber(f.UnitPrice?.valueNumber ?? f.UnitPrice?.content);

    const amountCurrency = f.Amount?.valueCurrency;
    const totalPriceCurrency = f.TotalPrice?.valueCurrency;

    const lineTotal =
      asNumber(amountCurrency?.amount) ||
      asNumber(f.Amount?.valueNumber ?? f.Amount?.content) ||
      asNumber(totalPriceCurrency?.amount) ||
      asNumber(f.TotalPrice?.valueNumber ?? f.TotalPrice?.content);

    items.push({
      name: f.Description?.valueString || f.Description?.content,
      qty: asNumber(f.Quantity?.valueNumber ?? f.Quantity?.content),
      price: unitPrice,
      total: lineTotal,
    });
  }

  const sumItemTotals = sumArray(items.map((i) => i.total));

  let subtotal = subTotal;
  let tax = totalTax;
  let grossAmount = invoiceTotal;

  if (grossAmount == null && isNum(subtotal) && isNum(tax)) {
    grossAmount = subtotal + tax;
  }
  if (grossAmount == null) {
    grossAmount = sumItemTotals;
  }

  // subtotal が無ければ、総額と税から逆算
  if (subtotal == null && isNum(grossAmount) && isNum(tax)) {
    subtotal = grossAmount - tax;
  }

  return {
    ocrText: buildOcrText(result),
    detected: {
      date: normDate(dateRaw),
      amount: grossAmount,
      vendor,
      items,
      tax,
      subtotal,
    },
  };
}

// ------------------ Provider 実装 ------------------

export default class AzureReceiptProvider implements OcrProvider {
  // 旧インターフェース互換（レシート前提）
  async parseReceiptFromBuffer(buffer: Buffer, mimeType = 'application/octet-stream'): Promise<OcrResult> {
    return this.parseFromBuffer(buffer, mimeType, 'receipt');
  }

  // 新：論理モデルを指定して呼ぶ用
  async parseFromBuffer(
    buffer: Buffer,
    mimeType = 'application/octet-stream',
    logicalModel: LogicalModel = 'receipt',
  ): Promise<OcrResult> {
    const result = await analyzeWithModel(buffer, mimeType, logicalModel);
    if (logicalModel === 'invoice') {
      return parseInvoiceDoc(result);
    }
    return parseReceiptDoc(result);
  }
}
