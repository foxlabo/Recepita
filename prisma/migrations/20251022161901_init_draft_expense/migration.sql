/*
  Warnings:

  - You are about to drop the `Business` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExpenseDraft` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExpenseFile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Invoice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InvoiceDefaults` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Partner` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Business" DROP CONSTRAINT "Business_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InvoiceDefaults" DROP CONSTRAINT "InvoiceDefaults_businessId_fkey";

-- DropTable
DROP TABLE "public"."Business";

-- DropTable
DROP TABLE "public"."ExpenseDraft";

-- DropTable
DROP TABLE "public"."ExpenseFile";

-- DropTable
DROP TABLE "public"."Invoice";

-- DropTable
DROP TABLE "public"."InvoiceDefaults";

-- DropTable
DROP TABLE "public"."Partner";

-- CreateTable
CREATE TABLE "public"."DraftExpense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registeredDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "category" TEXT,
    "memo" TEXT,
    "itemsSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftExpense_userId_createdAt_idx" ON "public"."DraftExpense"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_userId_date_idx" ON "public"."Expense"("userId", "date");

-- AddForeignKey
ALTER TABLE "public"."DraftExpense" ADD CONSTRAINT "DraftExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
