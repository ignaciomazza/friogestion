-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "paidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Receipt"
ADD COLUMN "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReceiptLine"
ADD COLUMN "amountBase" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill
UPDATE "ReceiptLine" SET "amountBase" = "amount" WHERE "amountBase" = 0;
UPDATE "Sale" SET "balance" = COALESCE("total", 0) WHERE "balance" = 0;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Receipt_createdByUserId_idx" ON "Receipt"("createdByUserId");
CREATE INDEX "Receipt_confirmedByUserId_idx" ON "Receipt"("confirmedByUserId");
