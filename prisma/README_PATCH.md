# Prisma patch for Expense items JSON + extra fields

## 変更点（Expenseモデル）
- `items` (Json?)
- `subtotal` (Int?)
- `tax` (Int?)
- `total` (Int?)
- `paymentMethod` (String?)

## 追記例（schema.prisma の model Expense 内）
```prisma
model Expense {
  id        String   @id @default(cuid())
  date      DateTime
  amount    Int
  vendor    String
  category  String?
  memo      String?

  // ▼ 追加
  items     Json?
  subtotal  Int?
  tax       Int?
  total     Int?
  paymentMethod String?

  user      User     @relation(fields: [userId], references: [id])
  userId    String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## マイグレーション
```bash
npx prisma migrate dev --name add_items_and_totals
```
