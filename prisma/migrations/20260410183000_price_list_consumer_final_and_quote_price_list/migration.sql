ALTER TABLE "PriceList"
ADD COLUMN "isConsumerFinal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Quote"
ADD COLUMN "priceListId" TEXT;

UPDATE "Quote" AS q
SET "priceListId" = c."defaultPriceListId"
FROM "Customer" AS c
WHERE q."customerId" = c."id"
  AND q."priceListId" IS NULL
  AND c."defaultPriceListId" IS NOT NULL;

CREATE INDEX "Quote_priceListId_idx"
ON "Quote"("priceListId");

ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_priceListId_fkey"
FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
