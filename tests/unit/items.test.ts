import { describe, expect, it } from 'vitest';
import {
  expenseItemsText,
  formatItemsText,
  itemsFromJson,
  lineItemsOrder,
  parseAmountInput,
  parseItemsText,
  parseYen,
  toExpenseItemData,
  toLineItemCreateData,
} from '@/lib/items';

describe('parseYen (lenient)', () => {
  it.each([
    ['1200', 1200],
    ['1,200', 1200],
    ['1,234,567', 1234567],
    ['¥1,200', 1200],
    ['￥1,200', 1200],
    ['100円(税込)', 100],
    ['１，２００円', 1200],
    ['-50', -50],
    ['-¥50', -50],
    ['−50', -50],
    ['▲50', -50],
    ['△1,000', -1000],
    ['値引き ▲30', -30],
    ['12.4', 12],
    ['12.5', 13],
    ['-0', 0],
    ['▲0', 0],
  ])('%j -> %i', (raw, expected) => {
    expect(parseYen(raw)).toBe(expected);
  });

  it('rounds numbers and rejects non-finite ones', () => {
    expect(parseYen(99.6)).toBe(100);
    expect(parseYen(-5)).toBe(-5);
    expect(parseYen(Number.NaN)).toBeUndefined();
    expect(parseYen(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it.each([null, undefined, '', '   ', 'abc', '円', '▲'])('%j -> undefined', (raw) => {
    expect(parseYen(raw)).toBeUndefined();
  });
});

describe('parseAmountInput (strict form field)', () => {
  it.each([
    ['1200', 1200],
    ['1,200', 1200],
    [' 1 200 ', 1200],
    ['¥1,200', 1200],
    ['1,200円', 1200],
    ['１２００', 1200],
    ['-50', -50],
    ['+50', 50],
    ['▲50', -50],
    ['△50', -50],
    ['−50', -50],
    ['－50', -50],
    ['1.5', 1.5],
    ['0', 0],
  ])('%j -> %d', (raw, expected) => {
    expect(parseAmountInput(raw)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '12abc', '1.2.3', '--5', '-', '¥', '1e3', '0x10'])('%j -> undefined', (raw) => {
    expect(parseAmountInput(raw)).toBeUndefined();
  });

  it('passes finite numbers through and rejects other types', () => {
    expect(parseAmountInput(12.5)).toBe(12.5);
    expect(parseAmountInput(Number.NaN)).toBeUndefined();
    expect(parseAmountInput(null)).toBeUndefined();
    expect(parseAmountInput(undefined)).toBeUndefined();
    expect(parseAmountInput({})).toBeUndefined();
  });
});

describe('parseItemsText', () => {
  it('parses "name:amount" items separated by commas', () => {
    expect(parseItemsText('コピー用紙:550, 値引き:-50')).toEqual([
      { name: 'コピー用紙', amount: 550 },
      { name: '値引き', amount: -50 },
    ]);
  });

  it('keeps thousands separators inside amounts', () => {
    expect(parseItemsText('モニター:21,800, ケーブル:1,200')).toEqual([
      { name: 'モニター', amount: 21800 },
      { name: 'ケーブル', amount: 1200 },
    ]);
    expect(parseItemsText('PC:1,234,567')).toEqual([{ name: 'PC', amount: 1234567 }]);
  });

  it('understands ▲/△ discounts, full-width separators and 円', () => {
    expect(parseItemsText('お弁当：600円、割引：▲100、ポイント=△20')).toEqual([
      { name: 'お弁当', amount: 600 },
      { name: '割引', amount: -100 },
      { name: 'ポイント', amount: -20 },
    ]);
  });

  it('splits on newlines (CRLF too) and skips blank parts', () => {
    expect(parseItemsText('A:100\r\n\r\n B : 200 \n,, 、')).toEqual([
      { name: 'A', amount: 100 },
      { name: 'B', amount: 200 },
    ]);
  });

  it('uses the last separator so names may contain ":"', () => {
    expect(parseItemsText('Type:C ケーブル:980')).toEqual([{ name: 'Type:C ケーブル', amount: 980 }]);
  });

  it('defaults missing amounts to 0 and missing names to 不明', () => {
    expect(parseItemsText('メモ帳')).toEqual([{ name: 'メモ帳', amount: 0 }]);
    expect(parseItemsText('メモ帳:')).toEqual([{ name: 'メモ帳', amount: 0 }]);
    expect(parseItemsText(':300')).toEqual([{ name: '不明', amount: 300 }]);
  });

  it.each([null, undefined, '', '   ', '\n\n', ' , 、 '])('%j -> []', (text) => {
    expect(parseItemsText(text)).toEqual([]);
  });

  it('caps very long names', () => {
    const [line] = parseItemsText(`${'x'.repeat(600)}:1`);
    expect(line.name).toHaveLength(500);
  });
});

describe('formatItemsText', () => {
  it('joins items and omits zero amounts', () => {
    expect(
      formatItemsText([
        { name: 'A', amount: 100 },
        { name: 'B', amount: 0 },
        { name: 'C', amount: -50 },
      ]),
    ).toBe('A:100, B, C:-50');
  });

  it('drops empty names and flattens separators inside names', () => {
    expect(
      formatItemsText([
        { name: '  ', amount: 5 },
        { name: null, amount: 1 },
        { name: 'A,B\nC、D', amount: 10 },
      ]),
    ).toBe('A B C D:10');
  });

  it('round-trips through parseItemsText', () => {
    const lines = [
      { name: 'コピー用紙', amount: 1200 },
      { name: '値引き', amount: -50 },
      { name: 'Type:C ケーブル', amount: 980 },
      { name: '袋', amount: 0 },
    ];
    expect(parseItemsText(formatItemsText(lines))).toEqual(lines);
  });

  it('keeps a name containing ":" intact even when its amount is 0', () => {
    const lines = [{ name: 'Type:C', amount: 0 }];
    expect(parseItemsText(formatItemsText(lines))).toEqual(lines);
  });
});

describe('itemsFromJson / expenseItemsText', () => {
  it('maps OCR / legacy JSON items', () => {
    expect(
      itemsFromJson([
        { name: 'A', total: 100 },
        { description: 'B', amount: '¥1,200' },
        { item: 'C', price: 30 },
        { name: 'D', unitPrice: '▲10' },
        { name: 'E' },
        { name: '' },
        null,
        { total: 5 },
      ]),
    ).toEqual([
      { name: 'A', amount: 100 },
      { name: 'B', amount: 1200 },
      { name: 'C', amount: 30 },
      { name: 'D', amount: -10 },
      { name: 'E', amount: 0 },
    ]);
  });

  it('ignores non-arrays', () => {
    expect(itemsFromJson(null)).toEqual([]);
    expect(itemsFromJson({ name: 'A' })).toEqual([]);
    expect(itemsFromJson('A:100')).toEqual([]);
  });

  it('prefers ExpenseItem rows over the legacy JSON column', () => {
    expect(expenseItemsText({ lineItems: [{ name: 'Row', amount: 1 }], items: [{ name: 'Legacy', total: 2 }] })).toBe(
      'Row:1',
    );
    expect(expenseItemsText({ lineItems: [], items: [{ name: 'Legacy', total: 2 }] })).toBe('Legacy:2');
    expect(expenseItemsText({ lineItems: null, items: null })).toBe('');
  });
});

describe('ExpenseItem create data', () => {
  it('toExpenseItemData stores each line as qty 1', () => {
    expect(toExpenseItemData([{ name: 'A', amount: -50 }])).toEqual([
      { name: 'A', qty: 1, unitPrice: -50, amount: -50, taxRate: 10 },
    ]);
  });

  it('toLineItemCreateData derives qty / unit price / amount', () => {
    expect(
      toLineItemCreateData([
        { name: ' A ', qty: 2, price: 150 },
        { name: 'B', total: 1000 },
        { name: 'C', qty: 0, price: 10.4, total: 9.6 },
        { name: '  ', total: 1 },
        { name: null, total: 1 },
      ]),
    ).toEqual([
      { name: 'A', qty: 2, unitPrice: 150, amount: 300, taxRate: 10 },
      { name: 'B', qty: 1, unitPrice: 1000, amount: 1000, taxRate: 10 },
      { name: 'C', qty: 1, unitPrice: 10, amount: 10, taxRate: 10 },
    ]);
  });

  it('reads rows back in insertion order', () => {
    expect(lineItemsOrder).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });
});
