import { describe, expect, it } from 'vitest';
import { csvCell, csvRow, parseCsv } from '@/lib/csv';
import { coerceDraftFromCsv, draftFromOcrRow, draftsFromCsv } from '@/lib/draft-import';

describe('csvCell: formula injection', () => {
  it.each([
    ['=SUM(A1:A3)', "'=SUM(A1:A3)"],
    ['+81-3-1234-5678', "'+81-3-1234-5678"],
    ['-50', "'-50"],
    ['@SUM(1)', "'@SUM(1)"],
    ['\t=1+1', "'\t=1+1"],
    ['=HYPERLINK("http://evil.example","x")', '"\'=HYPERLINK(""http://evil.example"",""x"")"'],
    ['=1+1,2', `"'=1+1,2"`],
  ])('neutralises %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it('flattens line breaks before checking, so a break cannot start a formula', () => {
    expect(csvCell('a\r\n=1+1')).toBe('a =1+1');
    expect(csvCell('\n=1+1')).toBe(' =1+1');
    expect(csvCell('\r=1+1').startsWith('=')).toBe(false);
  });

  it('leaves real numbers numeric (negative amounts too)', () => {
    expect(csvCell(-50)).toBe('-50');
    expect(csvCell(1200)).toBe('1200');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('leaves harmless text alone', () => {
    expect(csvCell('コピー用紙')).toBe('コピー用紙');
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell(' =1')).toBe(' =1');
  });

  it('quotes cells with commas or quotes', () => {
    expect(csvCell('A, B')).toBe('"A, B"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('maps null/undefined to an empty cell and stringifies other values', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('true');
  });

  it('csvRow joins escaped cells', () => {
    expect(csvRow(['2026-09-30', -50, '=cmd', 'a,b', null])).toBe(`2026-09-30,-50,'=cmd,"a,b",`);
  });
});

describe('parseCsv', () => {
  it('reads records keyed by the header row', () => {
    expect(parseCsv('取引日,金額,取引先\r\n2026-09-30,1200,文具店\n2026-10-01,-50,"A, Inc."')).toEqual([
      { 取引日: '2026-09-30', 金額: '1200', 取引先: '文具店' },
      { 取引日: '2026-10-01', 金額: '-50', 取引先: 'A, Inc.' },
    ]);
  });

  it('skips title lines above the header when the header is known', () => {
    const text = '経費エクスポート\n出力日: 2026-10-01\n取引日,金額\n2026-09-30,100';
    expect(parseCsv(text, ['取引日'])).toEqual([{ 取引日: '2026-09-30', 金額: '100' }]);
  });

  it('handles "" escapes, blank lines, empty rows, trimming and short rows', () => {
    const text = 'name , memo, x\n\n"say ""hi""", a ,\n , , \n only';
    expect(parseCsv(text)).toEqual([
      { name: 'say "hi"', memo: 'a', x: '' },
      { name: 'only', memo: '', x: '' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\r\n\n')).toEqual([]);
    expect(parseCsv('header-only')).toEqual([]);
  });
});

describe('draft import from CSV', () => {
  it('maps Japanese columns and normalises dates and amounts', () => {
    const csv = [
      'Recepita エクスポート',
      '登録日,取引日,金額,取引先,区分,品目,メモ',
      '2026/10/1,2026年9月30日,"¥1,200",文具店,消耗品費,"コピー用紙:1,200",月末分',
    ].join('\n');
    expect(draftsFromCsv(csv)).toEqual([
      {
        registeredDate: '2026-10-01',
        tradeDate: '2026-09-30',
        amount: 1200,
        vendor: '文具店',
        category: '消耗品費',
        itemsSummary: 'コピー用紙:1,200',
        memo: '月末分',
      },
    ]);
  });

  it('matches headers exactly first, then by substring (invoice amount columns first)', () => {
    const d = coerceDraftFromCsv({ 日付: '2026-09-01', '請求金額（税込）': '▲3,300', 宛名: 'ACME' });
    expect(d.amount).toBe(-3300);
    expect(d.vendor).toBe('ACME');
    expect(d.tradeDate).toBe('2026-09-01');
    expect(d.registeredDate).toBeUndefined();
    expect(coerceDraftFromCsv({ 合計金額: '500', 税込金額: '550' }).amount).toBe(550);
    expect(coerceDraftFromCsv({ '請求金額（税込）': '550', 金額: '500' }).amount).toBe(500);
  });

  it('accepts English headers', () => {
    expect(
      coerceDraftFromCsv({ date: '2026-09-01', amount: '10', vendor: 'V', category: 'C', items: 'I', memo: 'M' }),
    ).toEqual({
      registeredDate: undefined,
      tradeDate: '2026-09-01',
      amount: 10,
      vendor: 'V',
      category: 'C',
      itemsSummary: 'I',
      memo: 'M',
    });
  });

  it('passes values it cannot interpret through for the server to reject', () => {
    const d = coerceDraftFromCsv({ 取引日: '2026-02-30', 金額: 'abc' });
    expect(d.tradeDate).toBe('2026-02-30');
    expect(d.amount).toBeNaN();
    expect(coerceDraftFromCsv({ 取引日: '2026-09-01' }).amount).toBe(0);
  });

  it('maps OCR rows', () => {
    expect(draftFromOcrRow({ date: '2026-09-30', amount: 500, vendor: 'Shop', itemsText: 'A:500' })).toEqual({
      tradeDate: '2026-09-30',
      amount: 500,
      vendor: 'Shop',
      category: '',
      memo: '',
      itemsSummary: 'A:500',
    });
  });
});
