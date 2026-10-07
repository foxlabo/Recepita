// lib/drafts.ts
import { z } from 'zod';
import { dateInputSchema, optionalText } from '@/lib/validation';

/** Lenient amount: non-numeric input (NaN → null in JSON) becomes 0 as before. */
const draftAmountSchema = z
  .union([z.number(), z.string().max(32), z.null()])
  .optional()
  .transform((v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && Math.abs(n) <= 2_147_483_647 ? Math.round(n) : 0;
  });

/** One draft expense as sent by the expense registration screens. */
export const draftInputSchema = z.object({
  registeredDate: dateInputSchema.optional(),
  tradeDate: dateInputSchema,
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
