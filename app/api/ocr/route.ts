// app/api/ocr/route.ts
// Receipt / invoice OCR (Azure Document Intelligence) + optional AI category.
// Requires a session; per-user rate limits; 10 MB / MIME allow-list; provider
// error details are logged briefly server-side and never returned.
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-server';
import { HttpError, jsonError } from '@/lib/http';
import { enforce, RATE_LIMITS } from '@/lib/rate-limit';
import { inferExpenseCategory } from '@/lib/ai/expenseCategory';
import { formatItemsText, itemsFromJson } from '@/lib/items';
import { parseRetryAfter } from '@/lib/retry-after';
import { normalizeDetectedForTotals } from '@/lib/ocr/normalize';
import { type DetectedType, sniffType } from '@/lib/ocr/sniff';

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

// ---------------------------------------------------------------- provider

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

type ProviderError = { message?: string; status?: number; retryAfter?: string | null };

function isTransient(e: ProviderError) {
  const status = e.status ?? 0;
  const msg = (e.message ?? '').toLowerCase();
  return (
    status === 429 ||
    status >= 500 ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
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

  // 品目は画面と同じ "name:amount, …" 形式（lib/items.ts）
  let itemsSummary = formatItemsText(itemsFromJson(res?.detected?.items));
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
