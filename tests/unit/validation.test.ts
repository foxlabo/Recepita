import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { draftInputSchema, toDraftData } from '@/lib/drafts';
import { newPasswordSchema, passwordInputSchema } from '@/lib/password';
import {
  dateInputSchema,
  dateOnlySchema,
  emailSchema,
  expenseItemsSchema,
  idListSchema,
  int32Schema,
  normalizeEmail,
  optionalText,
} from '@/lib/validation';

/** First issue message of a failed parse (undefined when it succeeded). */
function messageOf(schema: z.ZodType, value: unknown): string | undefined {
  const r = schema.safeParse(value);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
    expect(normalizeEmail('  A@B.C ')).toBe('a@b.c');
  });

  it.each([
    ['', 'メールアドレスを入力してください。'],
    ['   ', 'メールアドレスを入力してください。'],
    [undefined, 'メールアドレスを入力してください。'],
    [123, 'メールアドレスを入力してください。'],
    ['not-an-email', 'メールアドレスの形式が正しくありません。'],
    ['a@b', 'メールアドレスの形式が正しくありません。'],
    [`${'a'.repeat(250)}@x.jp`, 'メールアドレスが長すぎます。'],
  ])('%j → %s', (value, message) => {
    expect(messageOf(emailSchema, value)).toBe(message);
  });
});

describe('id schemas', () => {
  it('idListSchema bounds the list', () => {
    expect(idListSchema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(messageOf(idListSchema, [])).toBe('対象が選択されていません。');
    expect(
      messageOf(
        idListSchema,
        Array.from({ length: 1001 }, (_, i) => `id${i}`),
      ),
    ).toBe('一度に処理できる件数を超えています。');
    expect(messageOf(idListSchema, 'a')).toBe('IDの一覧が正しくありません。');
    expect(idListSchema.safeParse(['']).success).toBe(false);
    expect(idListSchema.safeParse(['x'.repeat(65)]).success).toBe(false);
  });
});

describe('date schemas', () => {
  it('dateOnlySchema stores 00:00 UTC and names the field in errors', () => {
    const schema = dateOnlySchema('取引日');
    expect(schema.parse(' 2026/9/30 ').toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(messageOf(schema, '')).toBe('取引日を入力してください。');
    expect(messageOf(schema, undefined)).toBe('取引日を入力してください。');
    expect(messageOf(schema, '2026-02-30')).toBe('取引日はYYYY-MM-DD形式の正しい日付で入力してください。');
    expect(messageOf(dateOnlySchema(), 'x')).toBe('日付はYYYY-MM-DD形式の正しい日付で入力してください。');
  });

  it('dateInputSchema accepts calendar dates, instants and epoch millis', () => {
    expect(dateInputSchema.parse('2026-09-30').toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(dateInputSchema.parse('2026-09-30T15:00:00Z').toISOString()).toBe('2026-09-30T15:00:00.000Z');
    expect(dateInputSchema.parse(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(messageOf(dateInputSchema, 'yesterday')).toBe('日付が正しくありません。');
    expect(messageOf(dateInputSchema, true)).toBe('日付が正しくありません。');
  });
});

describe('number / text schemas', () => {
  it('int32Schema fits a PostgreSQL INTEGER', () => {
    expect(int32Schema.parse(2_147_483_647)).toBe(2_147_483_647);
    expect(int32Schema.parse(-2_147_483_648)).toBe(-2_147_483_648);
    expect(messageOf(int32Schema, 2_147_483_648)).toBe('数値が大きすぎます。');
    expect(messageOf(int32Schema, 1.5)).toBe('整数で入力してください。');
    expect(messageOf(int32Schema, '1')).toBe('数値が正しくありません。');
  });

  it('optionalText allows null/undefined and caps the length', () => {
    const s = optionalText(3);
    expect(s.parse(null)).toBeNull();
    expect(s.parse(undefined)).toBeUndefined();
    expect(s.parse('abc')).toBe('abc');
    expect(messageOf(s, 'abcd')).toBe('3文字以内で入力してください。');
    expect(messageOf(s, 1)).toBe('文字列で入力してください。');
  });

  it('expenseItemsSchema', () => {
    expect(expenseItemsSchema.parse([{ name: 'A', qty: 1, price: 100, total: 100 }, {}])).toHaveLength(2);
    expect(messageOf(expenseItemsSchema, {})).toBe('品目の形式が正しくありません。');
    expect(
      messageOf(
        expenseItemsSchema,
        Array.from({ length: 501 }, () => ({})),
      ),
    ).toBe('品目が多すぎます。');
    expect(expenseItemsSchema.safeParse([{ total: 2_147_483_648 }]).success).toBe(false);
  });
});

describe('draftInputSchema', () => {
  const base = { tradeDate: '2026-09-30', amount: 1200, vendor: '文具店' };

  it('normalises amounts to integer yen', () => {
    expect(draftInputSchema.parse({ ...base, amount: '1,200' }).amount).toBe(1200);
    expect(draftInputSchema.parse({ ...base, amount: '¥1,200' }).amount).toBe(1200);
    expect(draftInputSchema.parse({ ...base, amount: '▲50' }).amount).toBe(-50);
    expect(draftInputSchema.parse({ ...base, amount: 1200.5 }).amount).toBe(1201);
  });

  it.each([
    ['', '金額を入力してください。'],
    [null, '金額は数値で入力してください。'],
    ['abc', '金額は数値で入力してください。'],
    [3_000_000_000, '金額が大きすぎます。'],
    [undefined, '金額を入力してください。'],
    [true, '金額を入力してください。'],
  ])('amount %j → %s', (amount, message) => {
    expect(messageOf(draftInputSchema, { ...base, amount })).toBe(message);
  });

  it('requires a valid trade date', () => {
    expect(draftInputSchema.parse({ ...base, tradeDate: '2026年9月30日' }).tradeDate.toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
    expect(messageOf(draftInputSchema, { ...base, tradeDate: '' })).toBe('取引日を入力してください。');
    expect(messageOf(draftInputSchema, { ...base, tradeDate: '2026-02-30' })).toBe(
      '取引日はYYYY-MM-DD形式の正しい日付で入力してください。',
    );
  });

  it('treats an empty registeredDate as "now"', () => {
    const parsed = draftInputSchema.parse({ ...base, registeredDate: '' });
    expect(parsed.registeredDate).toBeUndefined();
    vi.useFakeTimers({ now: new Date('2026-10-01T03:04:05Z') });
    try {
      expect(toDraftData('u1', parsed).registeredDate.toISOString()).toBe('2026-10-01T03:04:05.000Z');
    } finally {
      vi.useRealTimers();
    }
    expect(draftInputSchema.parse({ ...base, registeredDate: '2026-10-01' }).registeredDate?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('toDraftData fills defaults and nulls empty optional fields', () => {
    const parsed = draftInputSchema.parse({
      ...base,
      vendor: undefined,
      category: '',
      memo: null,
      itemsSummary: 'A:1',
    });
    expect(toDraftData('u1', { ...parsed, registeredDate: new Date(0) })).toEqual({
      userId: 'u1',
      registeredDate: new Date(0),
      tradeDate: new Date('2026-09-30T00:00:00.000Z'),
      amount: 1200,
      vendor: '未設定',
      category: null,
      memo: null,
      itemsSummary: 'A:1',
    });
  });

  it('caps text lengths', () => {
    expect(messageOf(draftInputSchema, { ...base, vendor: 'x'.repeat(501) })).toBe('500文字以内で入力してください。');
  });
});

describe('password schemas', () => {
  it('newPasswordSchema: at least 8 characters and at most 72 bytes', () => {
    expect(newPasswordSchema.safeParse('12345678').success).toBe(true);
    expect(messageOf(newPasswordSchema, '1234567')).toBe('パスワードは8文字以上で入力してください。');
    expect(newPasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(messageOf(newPasswordSchema, 'a'.repeat(73))).toMatch(/72バイト/);
    // 24 × 3-byte characters = 72 bytes; 25 = 75 bytes (bcrypt would silently truncate)
    expect(newPasswordSchema.safeParse('あ'.repeat(24)).success).toBe(true);
    expect(messageOf(newPasswordSchema, 'あ'.repeat(25))).toMatch(/72バイト/);
    expect(messageOf(newPasswordSchema, undefined)).toBe('パスワードを入力してください。');
  });

  it('passwordInputSchema only checks presence and a sane length', () => {
    expect(passwordInputSchema.safeParse('x').success).toBe(true);
    expect(messageOf(passwordInputSchema, '')).toBe('パスワードを入力してください。');
    expect(messageOf(passwordInputSchema, 'x'.repeat(257))).toBe('パスワードが長すぎます。');
  });
});
