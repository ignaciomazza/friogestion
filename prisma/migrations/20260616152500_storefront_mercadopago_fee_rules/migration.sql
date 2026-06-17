ALTER TABLE "StorefrontChannel"
ADD COLUMN "mercadoPagoFeeRules" JSONB,
ADD COLUMN "mercadoPagoDefaultFeeDays" INTEGER;

ALTER TABLE "StorefrontPublication"
ADD COLUMN "mercadoPagoFeeDays" INTEGER;

UPDATE "StorefrontChannel"
SET
  "mercadoPagoFeeRules" = '[{"days":0,"netPercent":0}]'::jsonb,
  "mercadoPagoDefaultFeeDays" = 0
WHERE "mercadoPagoFeeRules" IS NULL;
