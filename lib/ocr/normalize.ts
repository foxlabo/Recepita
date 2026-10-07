// lib/ocr/normalize.ts
// Post-processing of OCR results on the server (moved from app/api/ocr/route.ts).

// ★ 金額系フィールドを「税込」寄りに正規化するヘルパー
export function normalizeDetectedForTotals(raw: any): any {
  const detected: any = { ...(raw || {}) };

  const toNum = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

  // Azure Invoice の別名っぽいフィールドも一応拾っておく
  let subtotal = toNum(detected.subtotal ?? detected.subTotal);
  let tax = toNum(detected.tax ?? detected.totalTax);
  // amountDue / invoiceTotal あたりも total 候補にする
  let total = toNum(detected.total ?? detected.amountDue ?? detected.invoiceTotal ?? detected.amount);
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
