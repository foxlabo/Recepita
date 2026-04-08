// /app/api/ocr/route.ts
import { NextRequest } from 'next/server';
import { inferExpenseCategory } from '@/lib/ai/expenseCategory';

console.log('[OCR ROUTE BUILD Retry-After版 + safe types] at', __filename);
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
let lastCall = 0;

async function rateLimit(minIntervalMs = 600) {
  const now = Date.now();
  const diff = now - lastCall;
  if (diff < minIntervalMs) await sleep(minIntervalMs - diff);
  lastCall = Date.now();
}

function parseRetryAfter(h?: string | null): number {
  if (!h) return 0;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n * 1000));
  const d = Date.parse(h);
  return Number.isNaN(d) ? 0 : Math.max(0, d - Date.now());
}

type LogicalModel = 'prebuilt-receipt' | 'invoice' | 'auto';

async function getFileAndModelFromForm(req: NextRequest): Promise<{
  buffer: Buffer;
  mime: string;
  logicalModel: LogicalModel;
} | null> {
  const form = await req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file) return null;

  const ab = await file.arrayBuffer();
  const mime = (file as any).type || 'application/octet-stream';

  const modelRaw = (form.get('model') as string | null) || 'prebuilt-receipt';
  let logicalModel: LogicalModel = 'prebuilt-receipt';
  if (modelRaw === 'invoice') logicalModel = 'invoice';
  else if (modelRaw === 'auto') logicalModel = 'auto';

  console.log('[OCR ROUTE] mime =', mime, 'logical model =', logicalModel);

  return { buffer: Buffer.from(ab), mime, logicalModel };
}

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

export async function POST(req: NextRequest) {
  const ctype = req.headers.get('content-type') || '';
  const provider = (process.env.OCR_PROVIDER || '').toLowerCase();

  if (!ctype.includes('multipart/form-data')) {
    return new Response(
      JSON.stringify({ ok: false, message: 'multipart/form-data required' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  if (provider !== 'azure') {
    return new Response(
      JSON.stringify({ ok: false, message: 'OCR provider not configured' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  const formData = await getFileAndModelFromForm(req);
  if (!formData) {
    return new Response(
      JSON.stringify({ ok: false, message: 'file required' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  const { buffer, mime, logicalModel } = formData;

  try {
    await rateLimit(600);

    const mod = await import('@/lib/ocr/azure');
    const Azure = (mod as any).default;
    const azure = new Azure();

    const maxAttempts = 4;
    let attempt = 0,
      lastErr: any;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        // ★ logicalModel をきちんと渡す（invoice / receipt）
        const res: any = await azure.parseFromBuffer(
          buffer,
          mime,
          logicalModel,
        );

        let itemsSummary = '';
        if (Array.isArray(res?.detected?.items)) {
          itemsSummary = res.detected.items
            .map(
              (it: any) =>
                `${it?.name ?? '不明'}:${it?.total ?? it?.price ?? ''}`,
            )
            .join(', ');
        }
        if (typeof res?.itemsSummary === 'string') itemsSummary = res.itemsSummary;

        // OpenAI で経費区分などを推定・補正
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
          console.warn('[OCR][ai] failed to infer category', aiErr);
          ai = res?.ai ?? {};
        }

        // ★ 最終的な detected に対して「税込」寄りに正規化
        res.detected = normalizeDetectedForTotals(res.detected);

        console.log(
          '[DETECTED DEBUG]',
          JSON.stringify(res.detected, null, 2),
        );

        return new Response(
          JSON.stringify({
            ok: true,
            ocrText: res.ocrText,
            detected: res.detected,
            ai,
            itemsSummary,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      } catch (e: any) {
        lastErr = e;
        const msg = (e?.message || '').toLowerCase();
        const status = (e?.status || e?.response?.status || 0) as number;
        const retryAfterHeader =
          e?.response?.headers?.['retry-after'] ||
          (e as any)?.headers?.['retry-after'] ||
          null;
        const is429 =
          status === 429 ||
          msg.includes('429') ||
          msg.includes('too many requests') ||
          msg.includes('rate');
        const isTransient =
          is429 ||
          status >= 500 ||
          msg.includes('timeout') ||
          msg.includes('temporarily') ||
          msg.includes('unavailable') ||
          msg.includes('econnreset');

        if (attempt < maxAttempts && isTransient) {
          const headerWait = parseRetryAfter(retryAfterHeader);
          const backoff = 800 * attempt;
          const wait = Math.max(headerWait, backoff);
          console.warn(
            `[OCR][retry ${attempt}/${maxAttempts}] ${
              e?.message || e
            } -> wait ${wait}ms (Retry-After=${
              retryAfterHeader || '-'
            })`,
          );
          await sleep(wait);
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('Unknown OCR failure');
  } catch (e: any) {
    const msg = e?.message || 'OCR failed';
    const is429 =
      msg.includes('429') ||
      String(msg).toLowerCase().includes('too many requests');
    return new Response(JSON.stringify({ ok: false, message: msg }), {
      status: is429 ? 429 : 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
