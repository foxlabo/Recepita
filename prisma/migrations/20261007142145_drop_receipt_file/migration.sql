/*
  Warnings:

  - You are about to drop the `ReceiptFile` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ReceiptFile" DROP CONSTRAINT "ReceiptFile_expenseId_fkey";

-- DropTable
DROP TABLE "ReceiptFile";
