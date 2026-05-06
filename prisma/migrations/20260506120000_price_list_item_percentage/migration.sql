-- Persist stock price-list percentages so USD costs can recalculate with the current internal FX rate.
ALTER TABLE "PriceListItem"
ADD COLUMN "percentage" DECIMAL(12,4);
