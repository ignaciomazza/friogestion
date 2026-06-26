UPDATE "Product"
SET "cost" = NULL
WHERE "cost" = 0;

UPDATE "Product"
SET "costUsd" = NULL
WHERE "costUsd" = 0;

UPDATE "Product"
SET "price" = NULL
WHERE "price" = 0;

UPDATE "PriceListItem"
SET "price" = NULL
WHERE "price" = 0;

UPDATE "PriceListItem" AS pli
SET "percentage" = NULL
FROM "Product" AS p
WHERE pli."productId" = p."id"
  AND pli."percentage" = 0
  AND pli."price" IS NULL
  AND p."cost" IS NULL
  AND p."costUsd" IS NULL;

DELETE FROM "PriceListItem"
WHERE "price" IS NULL
  AND "percentage" IS NULL;
