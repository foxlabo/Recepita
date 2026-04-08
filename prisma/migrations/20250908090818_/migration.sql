-- AlterTable
ALTER TABLE "public"."Expense" ADD COLUMN     "items" JSONB,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "subtotal" INTEGER,
ADD COLUMN     "tax" INTEGER,
ADD COLUMN     "total" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
