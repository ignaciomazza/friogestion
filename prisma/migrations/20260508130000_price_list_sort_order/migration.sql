ALTER TABLE "PriceList"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    "id",
    CAST(
      ROW_NUMBER() OVER (
        PARTITION BY "organizationId"
        ORDER BY "isDefault" DESC, "createdAt" ASC, "id" ASC
      ) AS INTEGER
    ) AS "position"
  FROM "PriceList"
  WHERE "isActive" = true
)
UPDATE "PriceList"
SET "sortOrder" = ordered."position"
FROM ordered
WHERE "PriceList"."id" = ordered."id";

CREATE INDEX "PriceList_organizationId_sortOrder_idx"
ON "PriceList"("organizationId", "sortOrder");
