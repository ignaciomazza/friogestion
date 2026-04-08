-- CreateEnum
CREATE TYPE "ExtraChargeType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "extraAmount" DECIMAL(12,2),
ADD COLUMN     "extraType" "ExtraChargeType",
ADD COLUMN     "extraValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "extraAmount" DECIMAL(12,2),
ADD COLUMN     "extraType" "ExtraChargeType",
ADD COLUMN     "extraValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxRate" DECIMAL(5,2);
