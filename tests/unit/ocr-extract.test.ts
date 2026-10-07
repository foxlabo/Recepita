import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baseKeyOf,
  extractDateFromText,
  mapAggregate,
  mapPerPage,
  type OcrPage,
  pagesToDraftRows,
  pickGrossFromText,
  pickSubtotalAndTaxFromText,
  sumArray,
  toDateStr,
  toNum,
  toOcrPage,
  unwrapOcrResponse,
} from '@/lib/ocr/extract';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-30T15:30:00Z') }); // 2026-10-01 00:30 JST
});
afterEach(() => {
  vi.useRealTimers();
});

const page = (over: Partial<OcrPage> = {}): OcrPage => ({
  key: 'r.jpg',
  groupKey: 'r.jpg',
  raw: {},
  text: '',
  detected: {},
  ai: {},
  ...over,
});

describe('number helpers', () => {
  it('toNum strips yen signs, commas and spaces', () => {
    expect(toNum('1,234円')).toBe(1234);
    expect(toNum('¥ 1234')).toBe(1234);
    expect(toNum('￥12.5')).toBe(12.5);
    expect(toNum(42)).toBe(42);
    expect(toNum('abc')).toBeUndefined();
    expect(toNum(null)).toBeUndefined();
    expect(toNum(undefined)).toBeUndefined();
  });

  it('sumArray ignores non-numbers', () => {
    expect(sumArray([1, '2', undefined, 3, Number.NaN])).toBe(4);
    expect(sumArray([undefined, 'x'])).toBeUndefined();
  });
});

describe('unwrapOcrResponse', () => {
  it('returns plain objects as they are', () => {
    const o = { ocrText: 'x' };
    expect(unwrapOcrResponse(o)).toBe(o);
  });

  it('unwraps chat-completion shaped and JSON-encoded payloads', () => {
    expect(unwrapOcrResponse({ choices: [{ message: { content: '{"amount":1}' } }] })).toEqual({ amount: 1 });
    expect(unwrapOcrResponse({ message: { content: ' [1,2] ' } })).toEqual([1, 2]);
    expect(unwrapOcrResponse({ content: '{"a":1}' })).toEqual({ a: 1 });
    expect(unwrapOcrResponse('{"ocrText":"T"}')).toEqual({ ocrText: 'T' });
  });

  it('leaves non-JSON strings alone', () => {
    expect(unwrapOcrResponse('{not json}')).toBe('{not json}');
    expect(unwrapOcrResponse('plain')).toBe('plain');
  });
});

describe('dates from OCR text', () => {
  it('toDateStr normalises calendar dates', () => {
    expect(toDateStr('2026/9/3')).toBe('2026-09-03');
    expect(toDateStr('bogus')).toBeUndefined();
  });

  it('prefers 注文日, then any y/m/d, then 年月日', () => {
    expect(extractDateFromText('発行 2026/09/01\n注文日：2026/8/31')).toBe('2026-08-31');
    expect(extractDateFromText('お買上げ 2026-9-5 12:30')).toBe('2026-09-05');
    expect(extractDateFromText('2026年 9月 30日 (水)')).toBe('2026-09-30');
  });

  it('returns undefined when there is no (valid) date', () => {
    expect(extractDateFromText(undefined)).toBeUndefined();
    expect(extractDateFromText('合計 1,000円')).toBeUndefined();
    expect(extractDateFromText('2026/13/45')).toBeUndefined();
    expect(extractDateFromText('2026年2月30日')).toBeUndefined();
    expect(extractDateFromText('2026年13月1日')).toBeUndefined();
  });
});

describe('amounts from OCR text', () => {
  it('prefers invoice totals', () => {
    expect(pickGrossFromText('小計 1,000\nご請求金額 ¥1,100\n合計 999')).toBe(1100);
    expect(pickGrossFromText('請求額：税込 5,500')).toBe(5500);
    expect(pickGrossFromText('請求合計: 2,200')).toBe(2200);
  });

  it('then 税込, then 合計 when larger than the fallback', () => {
    expect(pickGrossFromText('税込 1,650 円')).toBe(1650);
    expect(pickGrossFromText('合計金額: ¥3,300', 3000)).toBe(3300);
    expect(pickGrossFromText('合計 100', 500)).toBe(500);
  });

  it('then the largest 3+ digit amount, otherwise the fallback', () => {
    expect(pickGrossFromText('りんご 150\nみかん 1,280\nTEL 03')).toBe(1280);
    expect(pickGrossFromText('99 円', 7)).toBe(7);
    expect(pickGrossFromText(undefined, 7)).toBe(7);
    expect(pickGrossFromText('')).toBeUndefined();
  });

  it('pickSubtotalAndTaxFromText', () => {
    expect(pickSubtotalAndTaxFromText('小計 ¥1,000\n消費税：100')).toEqual({ subtotal: 1000, tax: 100 });
    expect(pickSubtotalAndTaxFromText('税額 80')).toEqual({ subtotal: undefined, tax: 80 });
    expect(pickSubtotalAndTaxFromText(undefined)).toEqual({});
  });
});

describe('pages', () => {
  it('baseKeyOf groups split PDF pages', () => {
    expect(baseKeyOf('invoice_p2.pdf')).toBe('invoice.pdf');
    expect(baseKeyOf('INVOICE_P10.PDF')).toBe('INVOICE.pdf');
    expect(baseKeyOf('photo_p2.jpg')).toBe('photo_p2.jpg');
  });

  it('toOcrPage maps results and failures', () => {
    expect(toOcrPage('a_p1.pdf', { raw: { ocrText: 'T', detected: { amount: 1 }, ai: { category: 'C' } } })).toEqual({
      key: 'a_p1.pdf',
      groupKey: 'a.pdf',
      raw: { ocrText: 'T', detected: { amount: 1 }, ai: { category: 'C' } },
      text: 'T',
      detected: { amount: 1 },
      ai: { category: 'C' },
    });
    expect(toOcrPage('b.jpg', { error: 'HTTP 502' })).toMatchObject({ raw: { error: 'HTTP 502' }, text: '' });
  });
});

describe('mapPerPage', () => {
  it('uses the structured result first', () => {
    const row = mapPerPage(
      page({
        detected: { date: '2026/9/30', amount: 1100, subtotal: 1000, tax: 100, vendor: 'Shop', items: [{ name: 'A' }] },
        ai: { category: '消耗品費', memo: 'm' },
      }),
    );
    expect(row).toEqual({
      date: '2026-09-30',
      amount: 1100,
      vendor: 'Shop',
      category: '消耗品費',
      memo: 'm',
      itemsText: 'A',
    });
  });

  it('falls back to subtotal + tax, then total, then items', () => {
    expect(mapPerPage(page({ detected: { subtotal: 1000, tax: 80 } })).amount).toBe(1080);
    expect(mapPerPage(page({ detected: { total: '2,000' } })).amount).toBe(2000);
    expect(mapPerPage(page({ detected: { items: [{ total: 300 }, { total: 200 }] } })).amount).toBe(300);
  });

  it('falls back to text, then today in JST', () => {
    const row = mapPerPage(page({ text: '注文日: 2026/9/1\nご請求金額 ¥4,400' }));
    expect(row.date).toBe('2026-09-01');
    expect(row.amount).toBe(4400);
    const empty = mapPerPage(page());
    expect(empty.date).toBe('2026-10-01');
    expect(empty.amount).toBe(0);
    expect(empty.vendor).toBe('');
  });

  it('does not use an impossible date from the text', () => {
    expect(mapPerPage(page({ text: '2026年2月30日 合計 500' })).date).toBe('2026-10-01');
  });
});

describe('mapAggregate / pagesToDraftRows', () => {
  const p1 = page({
    key: 'inv_p1.pdf',
    groupKey: 'inv.pdf',
    detected: { date: '2026-09-15', vendor: 'ACME', amount: 1000, items: [{ name: 'X' }] },
    ai: { category: '外注費' },
  });
  const p2 = page({
    key: 'inv_p2.pdf',
    groupKey: 'inv.pdf',
    detected: { date: '2026-09-10', amount: 500, items: [{ description: 'Y' }] },
  });

  it('sums the pages and takes the earliest date', () => {
    expect(mapAggregate([p1, p2])).toEqual({
      date: '2026-09-10',
      amount: 1500,
      vendor: 'ACME',
      category: '外注費',
      memo: undefined,
      itemsText: 'X, Y',
    });
  });

  it('truncates long item lists', () => {
    const many = page({ detected: { items: Array.from({ length: 50 }, (_, i) => ({ name: `item-${i}` })) } });
    const text = mapAggregate([many]).itemsText ?? '';
    expect(text.length).toBe(141);
    expect(text.endsWith('…')).toBe(true);
  });

  it('perPage: one row per page; aggregate: one row per file; failures skipped', () => {
    const failed = page({ key: 'bad.jpg', groupKey: 'bad.jpg', raw: { error: 'x' } });
    expect(pagesToDraftRows([p1, p2, failed], 'perPage')).toHaveLength(2);
    expect(pagesToDraftRows([p1, p2, failed], 'aggregate')).toHaveLength(1);
    const brokenPage = { ...p2, raw: { error: 'x' } };
    expect(pagesToDraftRows([p1, brokenPage], 'aggregate')).toEqual([]);
  });
});
