// lib/drafts.ts
import { z } from 'zod';
import { dateInputSchema, dateOnlySchema, optionalText } from '@/lib/validation';
import { parseAmountInput } from '@/lib/items';

const INT_MAX = 2_147_483_647;

/**
 * Amount in integer yen. Accepts a number or a numeric string ("1,200",
 * "¥1200"); decimals coming from OCR are rounded. Missing / non-numeric
 * values (NaN is sent as null in JSON) are rejected with a 400.
 */
const draftAmountSchema = z
  .union([z.number(), z.string().max(32), z.null()], { error: '金額を入力してください。' })
  .transform((v, ctx) => {
    if (v === '') {
      ctx.addIssue({ code: 'custom', message: '金額を入力してください。' });
      return z.NEVER;
    }
    const n = v === null ? undefined : parseAmountInput(v);
    if (n === undefined) {
      ctx.addIssue({ code: 'custom', message: '金額は数値で入力してください。' });
      return z.NEVER;
    }
    const yen = Math.round(n);
    if (Math.abs(yen) > INT_MAX) {
      ctx.addIssue({ code: 'custom', message: '金額が大きすぎます。' });
      return z.NEVER;
    }
    return yen;
  });

/** One draft expense as sent by the expense registration screens. */
export const draftInputSchema = z.object({
  /** 登録日（省略・空欄はサーバーの現在時刻） */
  registeredDate: z.preprocess((v) => (v === '' || v === null ? undefined : v), dateInputSchema.optional()),
  /** 取引日（必須、YYYY-MM-DD） */
  tradeDate: dateOnlySchema('取引日'),
  amount: draftAmountSchema,
  vendor: optionalText(500),
  category: optionalText(200),
  memo: optionalText(5000),
  itemsSummary: optionalText(10000),
});

export type DraftInput = z.output<typeof draftInputSchema>;

export function toDraftData(userId: string, b: DraftInput) {
  return {
    userId,
    registeredDate: b.registeredDate ?? new Date(),
    tradeDate: b.tradeDate,
    amount: b.amount,
    vendor: b.vendor ?? '未設定',
    category: b.category || null,
    memo: b.memo || null,
    itemsSummary: b.itemsSummary || null,
  };
}
