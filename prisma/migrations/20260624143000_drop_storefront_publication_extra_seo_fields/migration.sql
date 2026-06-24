-- Drop manual SEO fields that are now calculated from real publication/product data.
DROP INDEX IF EXISTS "storefront_publication_channel_indexable_priority_idx";
DROP INDEX IF EXISTS "storefront_publication_channel_subcategory_idx";

ALTER TABLE "StorefrontPublication"
  DROP CONSTRAINT IF EXISTS "StorefrontPublication_priority_range_check";

ALTER TABLE "StorefrontPublication"
  DROP COLUMN IF EXISTS "subcategory",
  DROP COLUMN IF EXISTS "productType",
  DROP COLUMN IF EXISTS "capacity",
  DROP COLUMN IF EXISTS "energyEfficiency",
  DROP COLUMN IF EXISTS "warranty",
  DROP COLUMN IF EXISTS "origin",
  DROP COLUMN IF EXISTS "relatedTerms",
  DROP COLUMN IF EXISTS "priority";
