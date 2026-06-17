ALTER TABLE "StorefrontChannel"
ADD COLUMN "mercadoPagoFeeRegion" TEXT;

UPDATE "StorefrontChannel"
SET
  "mercadoPagoFeeRegion" = 'ba_ch_er',
  "mercadoPagoFeeRules" = '[
    {"days":0,"netPercent":6.60},
    {"days":10,"netPercent":4.61},
    {"days":18,"netPercent":3.56},
    {"days":35,"netPercent":1.56}
  ]'::jsonb,
  "mercadoPagoDefaultFeeDays" = COALESCE("mercadoPagoDefaultFeeDays", 0)
WHERE "mercadoPagoFeeRegion" IS NULL;
