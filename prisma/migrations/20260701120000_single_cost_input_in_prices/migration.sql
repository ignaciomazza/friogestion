-- Add organization-level switch for simplified cost entry in Prices.
ALTER TABLE "Organization"
ADD COLUMN "singleCostInputInPrices" BOOLEAN NOT NULL DEFAULT false;
