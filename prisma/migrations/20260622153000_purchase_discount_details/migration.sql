ALTER TABLE "PurchaseInvoice"
ADD COLUMN "discountDetails" JSONB;

ALTER TABLE "PurchaseItem"
ADD COLUMN "discountDetails" JSONB;
