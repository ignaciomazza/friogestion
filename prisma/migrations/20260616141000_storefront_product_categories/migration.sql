ALTER TABLE "StorefrontChannel"
ADD COLUMN "productCategories" JSONB;

UPDATE "StorefrontChannel"
SET "productCategories" = '["General"]'::jsonb
WHERE "productCategories" IS NULL;
