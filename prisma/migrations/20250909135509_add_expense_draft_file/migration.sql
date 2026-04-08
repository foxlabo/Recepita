-- CreateTable
CREATE TABLE "public"."ExpenseDraft" (
    "id" TEXT NOT NULL,
    "scanSetId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExpenseFile" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT,
    "scanSetId" TEXT,
    "pageOrder" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDraft_scanSetId_key" ON "public"."ExpenseDraft"("scanSetId");
