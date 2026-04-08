-- 1) date(text) → date(timestamp(3)) への安全な変換
-- 既存の date 値が 'YYYY-MM-DD' か ISO('YYYY-MM-DDTHH:MM:SSZ...') を想定
ALTER TABLE "Expense"
ALTER COLUMN "date"
TYPE TIMESTAMP(3)
USING
  CASE
    -- '2025-09-06' 形式なら 00:00:00 を補ってキャスト
    WHEN "date" ~ '^\d{4}-\d{2}-\d{2}$' THEN ("date" || ' 00:00:00')::timestamp
    -- ISO 形式ならそのままキャスト
    WHEN "date" ~ '^\d{4}-\d{2}-\d{2}T' THEN "date"::timestamp
    -- 上記以外（万一）→ NULL（後続で NOT NULL を付ける前に要確認）
    ELSE NULL
  END;

-- 2) 必須制約（NOT NULL）を設定
ALTER TABLE "Expense"
ALTER COLUMN "date" SET NOT NULL;