// app/api/ocr/route.ts
// Receipt / invoice OCR (Azure Document Intelligence) + optional AI category.
// Requires a session; per-user rate limits; 10 MB / MIME allow-list; provider
// error details are logged briefly server-side and never returned.
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-server';
import { HttpError, jsonError } from '@/lib/http';
import { enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { inferExpenseCategory } from '@/lib/ai/expenseCategory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BODY_BYTES = MAX_FILE_BYTES + 512 * 1024; // + multipart overhead

const MSG_TOO_LARGE = 'ファイルサイズが大きすぎます（10MBまで）。';
const MSG_UNSUPPORTED = '対応していないファイル形式です（JPEG / PNG / WebP / HEIC / PDF）。';
const MSG_NO_FILE = 'ファイルを選択してください。';
const MSG_FAILED = '解析に失敗しました。時間をおいて再度お試しください。';
const MSG_BUSY = '解析サービスが混み合っています。しばらく時間をおいてから再度お試しください。';
const MSG_NOT_CONFIGURED = 'OCR機能が設定されていません。';

// ---------------------------------------------------------------- upload

type DetectedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heif' | 'application/pdf';

/** Declared types we accept (browsers may also send '' or octet-stream for HEIC). */
const ALLOWED_DECLARED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  '',
  'application/octet-stream',
]);

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif']);

/** Identify the file by its magic bytes; the declared type is not trusted. */
function sniffType(buf: Buffer): DetectedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buf.toString('latin1', 8, 12))) {
    return 'image/heif';
  }
  // PDF header must appear within the first 1024 bytes.
  if (buf.subarray(0, 1024).includes('%PDF-', 0, 'latin1')) return 'application/pdf';
  return null;
}

/** Read the request body, aborting as soon as it exceeds `limit` bytes. */
async function readBodyWithLimit(req: Request, limit: number): Promise<Buffer> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, MSG_TOO_LARGE);
  if (!req.body) throw new HttpError(400, MSG_NO_FILE);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, MSG_TOO_LARGE);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

type LogicalModel = 'receipt' | 'invoice';

async function readUpload(req: Request, contentType: string) {
  const body = await readBodyWithLimit(req, MAX_BODY_BYTES);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new HttpError(400, MSG_NO_FILE);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, MSG_NO_FILE);
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, MSG_TOO_LARGE);
  if (!ALLOWED_DECLARED.has((file.type || '').toLowerCase())) throw new HttpError(415, MSG_UNSUPPORTED);

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffType(buffer);
  if (!mime) throw new HttpError(415, MSG_UNSUPPORTED);

  // 'auto' は従来どおりレシートモデル扱い
  const logicalModel: LogicalModel = form.get('model') === 'invoice' ? 'invoice' : 'receipt';
  return { buffer, mime, logicalModel };
}

// ---------------------------------------------------------------- result

// ★ 金額系フィールドを「税込」寄りに正規化するヘルパー
function normalizeDetectedForTotals(raw: any): any {
  const detected: any = { ...(raw || {}) };

  const toNum = (v: any): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  // Azure Invoice の別名っぽいフィールドも一応拾っておく
  let subtotal = toNum(detected.subtotal ?? detected.subTotal);
  let tax = toNum(detected.tax ?? detected.totalTax);
  // amountDue / invoiceTotal あたりも total 候補にする
  let total = toNum(
    detected.total ??
      detected.amountDue ??
      detected.invoiceTotal ??
      detected.amount,
  );
  const amount = toNum(detected.amount);

  // subtotal が無ければ amount を小計扱いに
  if (subtotal == null && amount != null) {
    subtotal = amount;
  }

  // tax が無くて total と subtotal が両方あれば差分から推定
  if (tax == null && total != null && subtotal != null && total > subtotal) {
    tax = total - subtotal;
  }

  // total が無ければ subtotal + tax を優先
  if (total == null && subtotal != null && tax != null) {
    total = subtotal + tax;
  }

  // それでも無い場合は amount を total 扱い
  if (total == null && amount != null) {
    total = amount;
  }

  // subtotal が無くて total だけあれば、とりあえず subtotal = total
  if (subtotal == null && total != null) {
    subtotal = total;
  }

  // tax が未定義なら 0 に寄せる（税別しか来ないケースに備えて）
  if (tax == null) {
    tax = 0;
  }

  detected.subtotal = subtotal ?? detected.subtotal;
  detected.tax = tax;
  detected.total = total ?? detected.total ?? detected.subtotal ?? detected.amount;

  return detected;
}

// ---------------------------------------------------------------- provider

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function parseRetryAfter(h?: string | null): number {
  if (!h) return 0;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n * 1000));
  const d = Date.parse(h);
  return Number.isNaN(d) ? 0 : Math.max(0, d - Date.now());
}

type ProviderError = { message?: string; status?: number; retryAfter?: string | null };

function isTransient(e: ProviderError) {
  const status = e.status ?? 0;
  const msg = (e.message ?? '').toLowerCase();
  return status === 429 || status >= 500 || msg.includes('timed out') || msg.includes('econnreset') || msg.includes('fetch failed');
}

async function runOcr(buffer: Buffer, mime: DetectedType, logicalModel: LogicalModel) {
  const { default: AzureReceiptProvider } = await import('@/lib/ocr/azure');
  const azure = new AzureReceiptProvider();

  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await azure.parseFromBuffer(buffer, mime, logicalModel);
    } catch (err) {
      const e = err as ProviderError;
      if (attempt >= maxAttempts || !isTransient(e)) throw err;
      // 上限 10 秒（Retry-After が長すぎる場合はクライアント側の再試行に任せる）
      const wait = Math.min(10_000, Math.max(parseRetryAfter(e.retryAfter), 800 * attempt));
      console.warn(`[ocr] transient provider error (attempt ${attempt}/${maxAttempts}): ${e.message ?? 'unknown'}`);
      await sleep(wait);
    }
  }
}

// ---------------------------------------------------------------- handler

export const POST = withAuth(async (req, { session }) => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return jsonError(400, MSG_NO_FILE, { extra: { ok: false } });
  }
  // 申告サイズが上限超過なら本文を読まずに拒否（実際の読み込みも上限付き）
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonError(413, MSG_TOO_LARGE, { extra: { ok: false } });
  }
  if ((process.env.OCR_PROVIDER || '').toLowerCase() !== 'azure') {
    return jsonError(503, MSG_NOT_CONFIGURED, { extra: { ok: false } });
  }

  // ユーザー単位の回数制限（短期バースト + 1日の上限）
  await enforce(RATE_LIMITS.ocrMinute, session.userId);
  await enforce(RATE_LIMITS.ocrDay, session.userId);

  const { buffer, mime, logicalModel } = await readUpload(req, contentType);

  let res: Awaited<ReturnType<typeof runOcr>> & { ai?: any; itemsSummary?: string };
  try {
    res = await runOcr(buffer, mime, logicalModel);
  } catch (err) {
    const e = err as ProviderError;
    console.error(`[ocr] provider failed: ${e.message ?? 'unknown error'}`);
    return e.status === 429
      ? jsonError(429, MSG_BUSY, { extra: { ok: false }, headers: { 'Retry-After': '30' } })
      : jsonError(502, MSG_FAILED, { extra: { ok: false } });
  }

  let itemsSummary = '';
  if (Array.isArray(res?.detected?.items)) {
    itemsSummary = res.detected.items
      .map((it: any) => `${it?.name ?? '不明'}:${it?.total ?? it?.price ?? ''}`)
      .join(', ');
  }
  if (typeof res?.itemsSummary === 'string') itemsSummary = res.itemsSummary;

  // OpenAI で経費区分などを推定・補正（失敗しても OCR 結果は返す）
  let ai: any = res?.ai ?? {};
  try {
    ai = await inferExpenseCategory({
      vendor: res?.detected?.vendor,
      amount: res?.detected?.amount,
      itemsSummary,
      ocrText: res?.ocrText,
      detected: res?.detected,
      existingAi: ai,
    });
    // fixedDetected が返ってきた場合は detected にマージして補正
    if (ai && typeof ai.fixedDetected === 'object' && ai.fixedDetected) {
      res.detected = { ...(res.detected || {}), ...ai.fixedDetected };
    }
  } catch (aiErr) {
    console.warn('[ocr] AI category inference failed:', aiErr instanceof Error ? aiErr.message : 'unknown');
    ai = res?.ai ?? {};
  }

  // ★ 最終的な detected に対して「税込」寄りに正規化
  res.detected = normalizeDetectedForTotals(res.detected);

  return NextResponse.json({
    ok: true,
    ocrText: res.ocrText,
    detected: res.detected,
    ai,
    itemsSummary,
  });
});
