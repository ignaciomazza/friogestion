-- CreateEnum
CREATE TYPE "PurchaseDocumentType" AS ENUM (
  'INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE'
);

-- CreateEnum
CREATE TYPE "PurchaseDiscountType" AS ENUM (
  'AMOUNT',
  'PERCENT'
);

-- CreateEnum
CREATE TYPE "PurchaseDiscountBase" AS ENUM (
  'SUBTOTAL',
  'VAT',
  'TOTAL'
);

-- AlterTable
ALTER TABLE "PurchaseInvoice"
ADD COLUMN "documentType" "PurchaseDocumentType" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN "linkedPurchaseInvoiceId" TEXT,
ADD COLUMN "discountType" "PurchaseDiscountType",
ADD COLUMN "discountBase" "PurchaseDiscountBase",
ADD COLUMN "discountValue" DECIMAL(12,4),
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill document type from known ARCA voucher types.
UPDATE "PurchaseInvoice"
SET "documentType" = CASE
  WHEN "fiscalVoucherType" IN (3, 8, 13) THEN 'CREDIT_NOTE'::"PurchaseDocumentType"
  WHEN "fiscalVoucherType" IN (2, 7, 12) THEN 'DEBIT_NOTE'::"PurchaseDocumentType"
  ELSE 'INVOICE'::"PurchaseDocumentType"
END;

-- AlterTable
ALTER TABLE "PurchaseItem"
ADD COLUMN "discountType" "PurchaseDiscountType",
ADD COLUMN "discountBase" "PurchaseDiscountBase",
ADD COLUMN "discountValue" DECIMAL(12,4),
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "PurchaseInvoice_linkedPurchaseInvoiceId_idx" ON "PurchaseInvoice"("linkedPurchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice"
ADD CONSTRAINT "PurchaseInvoice_linkedPurchaseInvoiceId_fkey"
FOREIGN KEY ("linkedPurchaseInvoiceId") REFERENCES "PurchaseInvoice"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
