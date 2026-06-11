-- Indexes for storefront read paths, tracking lookups and reservation cleanup.
CREATE INDEX IF NOT EXISTS "product_org_name_idx"
  ON "Product"("organizationId", "name");

CREATE INDEX IF NOT EXISTS "product_org_brand_idx"
  ON "Product"("organizationId", "brand");

CREATE INDEX IF NOT EXISTS "product_org_purchase_code_idx"
  ON "Product"("organizationId", "purchaseCode");

CREATE INDEX IF NOT EXISTS "storefront_publication_channel_status_featured_name_idx"
  ON "StorefrontPublication"("channelId", "publicationStatus", "featured", "publicName");

CREATE INDEX IF NOT EXISTS "storefront_publication_channel_category_idx"
  ON "StorefrontPublication"("channelId", "category");

CREATE INDEX IF NOT EXISTS "storefront_publication_channel_shipping_type_idx"
  ON "StorefrontPublication"("channelId", "shippingType");

CREATE INDEX IF NOT EXISTS "storefront_order_channel_display_number_idx"
  ON "StorefrontOrder"("channelId", "displayNumber");

CREATE INDEX IF NOT EXISTS "storefront_order_channel_payment_ref_idx"
  ON "StorefrontOrder"("channelId", "paymentReference");

CREATE INDEX IF NOT EXISTS "storefront_order_channel_external_ref_idx"
  ON "StorefrontOrder"("channelId", "externalReference");

CREATE INDEX IF NOT EXISTS "storefront_reservation_channel_status_expires_idx"
  ON "StorefrontStockReservation"("channelId", "status", "expiresAt");
