-- CreateEnum
CREATE TYPE "PurchaseFiscalLineType" AS ENUM (
  'IIBB_PERCEPTION',
  'VAT_PERCEPTION',
  'INCOME_TAX_PERCEPTION',
  'MUNICIPAL_PERCEPTION',
  'INTERNAL_TAX',
  'OTHER'
);

-- AlterTable
ALTER TABLE "PurchaseInvoice"
ADD COLUMN "fiscalVoucherKind" TEXT,
ADD COLUMN "fiscalVoucherType" INTEGER,
ADD COLUMN "fiscalPointOfSale" INTEGER,
ADD COLUMN "fiscalVoucherNumber" INTEGER,
ADD COLUMN "authorizationMode" TEXT,
ADD COLUMN "authorizationCode" TEXT,
ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN "netTaxed" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "netNonTaxed" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "exemptAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "vatTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "otherTaxesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PurchaseFiscalLine" (
  "id" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT NOT NULL,
  "type" "PurchaseFiscalLineType" NOT NULL,
  "jurisdiction" TEXT,
  "baseAmount" DECIMAL(12,2),
  "rate" DECIMAL(7,4),
  "amount" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseFiscalLine_pkey" PRIMARY KEY ("id")
);

-- Backfill existing purchases with IVA-only semantics.
UPDATE "PurchaseInvoice"
SET
  "currencyCode" = COALESCE(NULLIF("currencyCode", ''), 'ARS'),
  "vatTotal" = COALESCE("taxes", 0),
  "netTaxed" = GREATEST(
    COALESCE("subtotal", COALESCE("total", 0) - COALESCE("taxes", 0)),
    0
  ),
  "netNonTaxed" = COALESCE("netNonTaxed", 0),
  "exemptAmount" = COALESCE("exemptAmount", 0),
  "otherTaxesTotal" = COALESCE("otherTaxesTotal", 0),
  "authorizationMode" = COALESCE(
    "authorizationMode",
    NULLIF("arcaValidationRequest"->>'mode', '')
  ),
  "authorizationCode" = COALESCE(
    "authorizationCode",
    NULLIF("arcaValidationRequest"->>'authorizationCode', '')
  ),
  "fiscalVoucherType" = COALESCE(
    "fiscalVoucherType",
    CASE
      WHEN ("arcaValidationRequest"->>'voucherType') ~ '^[0-9]+$'
      THEN ("arcaValidationRequest"->>'voucherType')::INTEGER
      ELSE NULL
    END
  ),
  "fiscalPointOfSale" = COALESCE(
    "fiscalPointOfSale",
    CASE
      WHEN ("arcaValidationRequest"->>'pointOfSale') ~ '^[0-9]+$'
      THEN ("arcaValidationRequest"->>'pointOfSale')::INTEGER
      ELSE NULL
    END
  ),
  "fiscalVoucherNumber" = COALESCE(
    "fiscalVoucherNumber",
    CASE
      WHEN ("arcaValidationRequest"->>'voucherNumber') ~ '^[0-9]+$'
      THEN ("arcaValidationRequest"->>'voucherNumber')::INTEGER
      ELSE NULL
    END
  );

UPDATE "PurchaseInvoice"
SET "fiscalVoucherKind" = COALESCE(
  "fiscalVoucherKind",
  CASE "fiscalVoucherType"
    WHEN 1 THEN 'A'
    WHEN 6 THEN 'B'
    WHEN 11 THEN 'C'
    ELSE NULL
  END
);

-- AddForeignKey
ALTER TABLE "PurchaseFiscalLine"
ADD CONSTRAINT "PurchaseFiscalLine_purchaseInvoiceId_fkey"
FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PurchaseFiscalLine_purchaseInvoiceId_idx" ON "PurchaseFiscalLine"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseFiscalLine_type_idx" ON "PurchaseFiscalLine"("type");
