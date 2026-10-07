// lib/ocr/client.ts
// Browser-side call of POST /api/ocr.
//
// Every request can cost an Azure call (and the route already retries
// transient provider errors itself), so the client retries only when the
// server explicitly asks for it: 429/503 with a Retry-After header, at most
// `retries` times and only for short waits. Other 4xx/5xx and network
// errors are reported immediately.
import { parseRetryAfter } from '@/lib/retry-after';

export type OcrModel = 'prebuilt-receipt' | 'invoice' | 'auto';

/** Longest Retry-After we are willing to wait for in the UI. */
const MAX_RETRY_WAIT_MS = 60_000;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export class OcrRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OcrRequestError';
  }
}

export async function callOcr(file: File, model: string, { retries = 0 }: { retries?: number } = {}): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('model', model);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api/ocr', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
    if (res.ok) return res.json();

    const wait = parseRetryAfter(res.headers.get('retry-after'));
    const retryable = (res.status === 429 || res.status === 503) && wait > 0 && wait <= MAX_RETRY_WAIT_MS;
    if (retryable && attempt < retries) {
      await sleep(wait);
      continue;
    }

    if (res.status === 401) {
      throw new OcrRequestError('ログインの有効期限が切れました。再度ログインしてください。', 401);
    }
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const msg = typeof data?.error === 'string' && data.error ? data.error : `解析に失敗しました（HTTP ${res.status}）`;
    throw new OcrRequestError(msg, res.status);
  }
}
