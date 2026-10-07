import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDetectedForTotals } from '@/lib/ocr/normalize';
import { sniffType } from '@/lib/ocr/sniff';
import { parseRetryAfter } from '@/lib/retry-after';

describe('sniffType (upload magic bytes)', () => {
  const bytes = (...b: number[]) => Buffer.from(b);
  const text = (s: string) => Buffer.from(s, 'latin1');

  it.each([
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), 'image/jpeg'],
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png'],
    ['WebP', text('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp'],
    ['HEIC', text('\x00\x00\x00\x18ftypheic\x00\x00'), 'image/heif'],
    ['HEIF (mif1)', text('\x00\x00\x00\x18ftypmif1\x00\x00'), 'image/heif'],
    ['PDF', text('%PDF-1.7\n%âãÏÓ'), 'application/pdf'],
    ['PDF after a short preamble', Buffer.concat([Buffer.alloc(100, 0x20), text('%PDF-1.4')]), 'application/pdf'],
  ])('%s', (_name, buf, expected) => {
    expect(sniffType(buf)).toBe(expected);
  });

  it.each([
    ['empty', Buffer.alloc(0)],
    ['HTML', text('<!doctype html><script>alert(1)</script>')],
    ['SVG', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', text('GIF89a')],
    ['ZIP', bytes(0x50, 0x4b, 0x03, 0x04)],
    ['MP4 (ftyp, not a HEIF brand)', text('\x00\x00\x00\x18ftypisom\x00\x00')],
    ['RIFF that is not WebP (WAV)', text('RIFF\x00\x00\x00\x00WAVEfmt ')],
    ['truncated JPEG', bytes(0xff, 0xd8)],
    ['PDF header after 1 KiB', Buffer.concat([Buffer.alloc(1024, 0x20), text('%PDF-1.4')])],
  ])('rejects %s', (_name, buf) => {
    expect(sniffType(buf)).toBeNull();
  });
});

describe('normalizeDetectedForTotals', () => {
  it('keeps consistent totals', () => {
    expect(normalizeDetectedForTotals({ subtotal: 1000, tax: 100, total: 1100, amount: 1100 })).toMatchObject({
      subtotal: 1000,
      tax: 100,
      total: 1100,
    });
  });

  it('derives the tax from total - subtotal', () => {
    expect(normalizeDetectedForTotals({ subtotal: 1000, total: 1080 })).toMatchObject({ tax: 80, total: 1080 });
  });

  it('derives the total from subtotal + tax and reads Azure invoice aliases', () => {
    expect(normalizeDetectedForTotals({ subTotal: 2000, totalTax: 200 })).toMatchObject({
      subtotal: 2000,
      tax: 200,
      total: 2200,
    });
    expect(normalizeDetectedForTotals({ amountDue: 5500, subtotal: 5000 })).toMatchObject({ total: 5500, tax: 500 });
  });

  it('uses amount when nothing else is known and defaults the tax to 0', () => {
    expect(normalizeDetectedForTotals({ amount: 770 })).toMatchObject({ subtotal: 770, tax: 0, total: 770 });
    expect(normalizeDetectedForTotals({ total: 990 })).toMatchObject({ subtotal: 990, tax: 0, total: 990 });
  });

  it('ignores non-numeric values and handles empty input', () => {
    expect(normalizeDetectedForTotals({ total: '1,000', tax: Number.NaN })).toMatchObject({ tax: 0, total: '1,000' });
    expect(normalizeDetectedForTotals(null)).toEqual({ subtotal: undefined, tax: 0, total: undefined });
  });

  it('does not mutate its input and keeps other fields', () => {
    const input = { amount: 100, vendor: 'Shop', items: [{ name: 'A' }] };
    const out = normalizeDetectedForTotals(input);
    expect(input).toEqual({ amount: 100, vendor: 'Shop', items: [{ name: 'A' }] });
    expect(out).toMatchObject({ vendor: 'Shop', items: [{ name: 'A' }] });
  });
});

describe('parseRetryAfter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads delay-seconds', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(parseRetryAfter('1.5')).toBe(1500);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('-5')).toBe(0);
  });

  it('reads HTTP dates relative to now', () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
    expect(parseRetryAfter('Thu, 01 Oct 2026 00:00:30 GMT')).toBe(30_000);
    expect(parseRetryAfter('Wed, 30 Sep 2026 23:59:00 GMT')).toBe(0);
  });

  it('returns 0 for missing or invalid values', () => {
    expect(parseRetryAfter(null)).toBe(0);
    expect(parseRetryAfter(undefined)).toBe(0);
    expect(parseRetryAfter('')).toBe(0);
    expect(parseRetryAfter('soon')).toBe(0);
  });
});

describe('Azure Document Intelligence provider (fetch stubbed, no network)', () => {
  const ENDPOINT = 'https://di.example.cognitiveservices.azure.com';
  const OP = `${ENDPOINT}/formrecognizer/documentModels/prebuilt-receipt/analyzeResults/abc?api-version=2023-07-31`;
  let fetchMock: ReturnType<typeof vi.fn>;

  const accepted = (location = OP) => new Response(null, { status: 202, headers: { 'operation-location': location } });
  const result = (body: unknown) => Response.json(body);

  async function load() {
    vi.resetModules();
    const mod = await import('@/lib/ocr/azure');
    return { provider: new mod.default(), OcrProviderError: mod.OcrProviderError };
  }

  /** Run a provider call while fake timers drive its 1-second polling. */
  async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
    const settled = p.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(25_000);
    return settled;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', ENDPOINT);
    vi.stubEnv('AZURE_DOCUMENT_INTELLIGENCE_KEY', 'test-key');
    vi.stubEnv('AZURE_DOCUMENT_INTELLIGENCE_API_VERSION', '2023-07-31');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses a receipt', async () => {
    fetchMock.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(
      result({
        status: 'succeeded',
        analyzeResult: {
          paragraphs: [{ content: 'コンビニ' }, { content: '合計 ¥1,100' }],
          documents: [
            {
              fields: {
                MerchantName: { valueString: 'コンビニ' },
                TransactionDate: { content: '2026/9/3' },
                Total: { valueNumber: 1100 },
                Subtotal: { content: '¥1,000' },
                Tax: { valueNumber: 100 },
                Items: {
                  valueArray: [
                    {
                      valueObject: {
                        Description: { valueString: 'お茶' },
                        Quantity: { valueNumber: 2 },
                        UnitPrice: { content: '150円' },
                        TotalPrice: { valueNumber: 300 },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
    );
    const { provider } = await load();
    const { value, error } = await settle(provider.parseReceiptFromBuffer(Buffer.from('img'), 'image/jpeg'));
    expect(error).toBeUndefined();
    expect(value).toEqual({
      ocrText: 'コンビニ\n合計 ¥1,100',
      detected: {
        date: '2026-09-03',
        amount: 1100,
        vendor: 'コンビニ',
        items: [{ name: 'お茶', qty: 2, price: 150, total: 300 }],
        tax: 100,
        subtotal: 1000,
      },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Ocp-Apim-Subscription-Key': 'test-key', 'Content-Type': 'image/jpeg' });
    expect(fetchMock.mock.calls[1][0]).toBe(OP);
  });

  it('keeps two-digit days and months of the transaction date', async () => {
    const cases = [
      ['2026-09-30', '2026-09-30'],
      ['2026-09-10', '2026-09-10'],
      ['2026-12-31', '2026-12-31'],
      ['2026/10/20', '2026-10-20'],
      ['2026.1.5', '2026-01-05'],
      ['2026/11/09 12:30', '2026-11-09'],
    ];
    for (const [raw] of cases) {
      fetchMock.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(
        result({
          status: 'succeeded',
          analyzeResult: { documents: [{ fields: { TransactionDate: { content: raw } } }] },
        }),
      );
    }
    const { provider } = await load();
    for (const [raw, expected] of cases) {
      const { value } = await settle(provider.parseFromBuffer(Buffer.from(raw)));
      expect(value?.detected.date, raw).toBe(expected);
    }
  });

  it('falls back to subtotal + tax, then the item totals', async () => {
    const doc = (fields: unknown) => result({ status: 'succeeded', analyzeResult: { documents: [{ fields }] } });
    fetchMock
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(doc({ Subtotal: { valueNumber: 1000 }, Tax: { valueNumber: 80 } }))
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(
        doc({
          Items: {
            valueArray: [
              { valueObject: { TotalPrice: { valueNumber: 120 } } },
              { valueObject: { TotalPrice: { content: '1,000' } } },
            ],
          },
        }),
      );
    const { provider } = await load();
    expect((await settle(provider.parseFromBuffer(Buffer.from('a')))).value?.detected.amount).toBe(1080);
    expect((await settle(provider.parseFromBuffer(Buffer.from('b')))).value?.detected.amount).toBe(1120);
  });

  it('parses an invoice (currency fields)', async () => {
    fetchMock.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(
      result({
        status: 'succeeded',
        analyzeResult: {
          documents: [
            {
              fields: {
                VendorName: { content: 'ACME株式会社' },
                InvoiceDate: { valueDate: '2026-09-30' },
                InvoiceTotal: { valueCurrency: { amount: 55000 } },
                TotalTax: { valueNumber: 5000 },
                Items: {
                  valueArray: [
                    {
                      valueObject: {
                        Description: { valueString: '開発' },
                        Quantity: { valueNumber: 1 },
                        UnitPrice: { valueCurrency: { amount: 50000 } },
                        Amount: { valueCurrency: { amount: 50000 } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
    );
    const { provider } = await load();
    const { value } = await settle(provider.parseFromBuffer(Buffer.from('pdf'), 'application/pdf', 'invoice'));
    expect(fetchMock.mock.calls[0][0]).toContain('/documentModels/prebuilt-invoice:analyze?');
    expect(value?.detected).toEqual({
      date: '2026-09-30',
      amount: 55000,
      vendor: 'ACME株式会社',
      items: [{ name: '開発', qty: 1, price: 50000, total: 50000 }],
      tax: 5000,
      subtotal: 50000,
    });
  });

  it('reports provider errors with status and Retry-After, without the response body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"message":"secret internal detail"}}', {
        status: 429,
        headers: { 'retry-after': '30' },
      }),
    );
    const { provider, OcrProviderError } = await load();
    const { error } = await settle(provider.parseFromBuffer(Buffer.from('x')));
    expect(error).toBeInstanceOf(OcrProviderError);
    expect(error).toMatchObject({ status: 429, retryAfter: '30' });
    expect(String((error as Error).message)).not.toContain('secret');
  });

  it('never sends the key to an operation-location on another origin', async () => {
    fetchMock.mockResolvedValueOnce(accepted('https://attacker.example/poll'));
    const { provider } = await load();
    const { error } = await settle(provider.parseFromBuffer(Buffer.from('x')));
    expect((error as Error).message).toMatch(/unexpected operation-location origin/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails on a missing operation-location, a failed analysis and a timeout', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const { provider } = await load();
    expect((await settle(provider.parseFromBuffer(Buffer.from('x')))).error).toMatchObject({
      message: '[Azure OCR] missing operation-location header',
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(result({ status: 'failed' }));
    expect((await settle(provider.parseFromBuffer(Buffer.from('x')))).error).toMatchObject({
      message: '[Azure OCR] analyze failed',
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(accepted()).mockImplementation(async () => result({ status: 'running' }));
    expect((await settle(provider.parseFromBuffer(Buffer.from('x')))).error).toMatchObject({
      message: '[Azure OCR] analyze timed out',
      status: 504,
    });
    expect(fetchMock).toHaveBeenCalledTimes(21);
  });

  it('refuses to run when not configured', async () => {
    vi.stubEnv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', '');
    vi.stubEnv('AZURE_DOCUMENT_INTELLIGENCE_KEY', '');
    const { provider } = await load();
    expect((await settle(provider.parseFromBuffer(Buffer.from('x')))).error).toMatchObject({
      message: '[Azure OCR] not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
