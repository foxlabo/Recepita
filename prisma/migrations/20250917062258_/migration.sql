-- CreateTable
CREATE TABLE "public"."ReceiptFile" (
    "id" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseId" TEXT,

    CONSTRAINT "ReceiptFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceiptFile_expenseId_idx" ON "public"."ReceiptFile"("expenseId");

-- AddForeignKey
ALTER TABLE "public"."ReceiptFile" ADD CONSTRAINT "ReceiptFile_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
