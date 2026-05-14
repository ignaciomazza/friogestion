-- Allow price-list percentage rules to be stored before a product cost is known.
ALTER TABLE "PriceListItem"
ALTER COLUMN "price" DROP NOT NULL;
