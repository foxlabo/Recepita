-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "client" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "itemsSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_userId_issueDate_idx" ON "public"."Invoice"("userId", "issueDate");

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
