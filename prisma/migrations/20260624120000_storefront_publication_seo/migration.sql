ALTER TABLE "StorefrontPublication"
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "metaDescription" TEXT,
ADD COLUMN "subcategory" TEXT,
ADD COLUMN "productType" TEXT,
ADD COLUMN "capacity" TEXT,
ADD COLUMN "energyEfficiency" TEXT,
ADD COLUMN "warranty" TEXT,
ADD COLUMN "origin" TEXT,
ADD COLUMN "relatedTerms" JSONB,
ADD COLUMN "indexable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "priority" DECIMAL(3,2) NOT NULL DEFAULT 0.5;

ALTER TABLE "StorefrontPublication"
ADD CONSTRAINT "StorefrontPublication_priority_range_check"
CHECK ("priority" >= 0 AND "priority" <= 1);

CREATE INDEX "storefront_publication_channel_indexable_priority_idx"
ON "StorefrontPublication"("channelId", "indexable", "priority");

CREATE INDEX "storefront_publication_channel_subcategory_idx"
ON "StorefrontPublication"("channelId", "subcategory");
