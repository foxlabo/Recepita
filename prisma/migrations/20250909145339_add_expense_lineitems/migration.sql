-- CreateTable
CREATE TABLE "public"."ExpenseItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER NOT NULL DEFAULT 10,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseItem_expenseId_idx" ON "public"."ExpenseItem"("expenseId");

-- AddForeignKey
ALTER TABLE "public"."ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
