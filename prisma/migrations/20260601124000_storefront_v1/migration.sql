-- CreateEnum
CREATE TYPE "StorefrontPublicationStatus" AS ENUM ('PUBLISHED', 'PAUSED');

-- CreateEnum
CREATE TYPE "StorefrontStockMode" AS ENUM ('STRICT', 'CONSULT', 'BACKORDER', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "StorefrontPricingMode" AS ENUM ('AUTO', 'FIXED');

-- CreateEnum
CREATE TYPE "StorefrontBillingMode" AS ENUM ('DEFAULT', 'MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "StorefrontShippingType" AS ENUM ('NORMAL', 'PICKUP', 'OWN_DELIVERY', 'QUOTE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "StorefrontOrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StorefrontOrderPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "StorefrontOrderDeliveryMethod" AS ENUM ('NORMAL', 'PICKUP', 'OWN_DELIVERY', 'QUOTE');

-- CreateEnum
CREATE TYPE "StorefrontReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StorefrontPaymentProvider" AS ENUM ('MERCADOPAGO');

-- CreateEnum
CREATE TYPE "StorefrontPaymentEventAction" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "StorefrontChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "storeName" TEXT NOT NULL,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "pickupAddress" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
    "defaultPriceListId" TEXT,
    "allowsCustomerAccounts" BOOLEAN NOT NULL DEFAULT true,
    "customerAccountsMode" TEXT NOT NULL DEFAULT 'prepared',
    "defaultPaymentMethod" TEXT NOT NULL DEFAULT 'mercadopago_checkout_api',
    "globalPriceAdjustmentPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "normalShippingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserveTtlMinutes" INTEGER NOT NULL DEFAULT 30,
    "manualBillingByDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontPaymentAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontPaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontPublication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "publicationStatus" "StorefrontPublicationStatus" NOT NULL DEFAULT 'PAUSED',
    "publicName" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "shippingType" "StorefrontShippingType" NOT NULL DEFAULT 'NORMAL',
    "hasGas" BOOLEAN NOT NULL DEFAULT false,
    "hasPressure" BOOLEAN NOT NULL DEFAULT false,
    "isFlammable" BOOLEAN NOT NULL DEFAULT false,
    "hasSpecialLogistics" BOOLEAN NOT NULL DEFAULT false,
    "stockMode" "StorefrontStockMode" NOT NULL DEFAULT 'STRICT',
    "webStockAvailable" INTEGER NOT NULL DEFAULT 0,
    "webStockReserved" INTEGER NOT NULL DEFAULT 0,
    "pricingMode" "StorefrontPricingMode" NOT NULL DEFAULT 'AUTO',
    "fixedFinalPrice" DECIMAL(12,2),
    "priceAdjustmentPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "billingMode" "StorefrontBillingMode" NOT NULL DEFAULT 'DEFAULT',
    "images" JSONB,
    "technicalSheet" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "saleId" TEXT,
    "displayNumber" TEXT,
    "status" "StorefrontOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "StorefrontOrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shippingTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "deliveryMethod" "StorefrontOrderDeliveryMethod" NOT NULL,
    "deliveryAddress" JSONB,
    "paymentMethod" TEXT NOT NULL,
    "manualBillingRequired" BOOLEAN NOT NULL DEFAULT true,
    "customerDisplayName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerTaxId" TEXT,
    "customerFiscalCondition" TEXT,
    "paymentReference" TEXT,
    "externalReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rawRequest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontOrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "publicationId" TEXT,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "publicName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceFinal" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "stockMode" "StorefrontStockMode" NOT NULL,
    "shippingType" "StorefrontShippingType" NOT NULL,
    "pricingMode" "StorefrontPricingMode" NOT NULL,
    "fixedFinalPrice" DECIMAL(12,2),
    "basePrice" DECIMAL(12,2),
    "adjustmentPercentTotal" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "manualBilling" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontStockReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StorefrontReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontStockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontPaymentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "StorefrontPaymentProvider" NOT NULL DEFAULT 'MERCADOPAGO',
    "action" "StorefrontPaymentEventAction" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "externalReference" TEXT,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontChannel_organizationId_code_key" ON "StorefrontChannel"("organizationId", "code");

-- CreateIndex
CREATE INDEX "StorefrontChannel_organizationId_idx" ON "StorefrontChannel"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontChannel_defaultPriceListId_idx" ON "StorefrontChannel"("defaultPriceListId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontApiKey_keyHash_key" ON "StorefrontApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "StorefrontApiKey_organizationId_idx" ON "StorefrontApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontApiKey_channelId_idx" ON "StorefrontApiKey"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontApiKey_isActive_idx" ON "StorefrontApiKey"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPaymentAdjustment_channelId_paymentMethod_key" ON "StorefrontPaymentAdjustment"("channelId", "paymentMethod");

-- CreateIndex
CREATE INDEX "StorefrontPaymentAdjustment_organizationId_idx" ON "StorefrontPaymentAdjustment"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontPaymentAdjustment_channelId_idx" ON "StorefrontPaymentAdjustment"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontPaymentAdjustment_isActive_idx" ON "StorefrontPaymentAdjustment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPublication_channelId_productId_key" ON "StorefrontPublication"("channelId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPublication_channelId_slug_key" ON "StorefrontPublication"("channelId", "slug");

-- CreateIndex
CREATE INDEX "StorefrontPublication_organizationId_idx" ON "StorefrontPublication"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontPublication_channelId_idx" ON "StorefrontPublication"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontPublication_productId_idx" ON "StorefrontPublication"("productId");

-- CreateIndex
CREATE INDEX "StorefrontPublication_publicationStatus_idx" ON "StorefrontPublication"("publicationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontOrder_saleId_key" ON "StorefrontOrder"("saleId");

-- CreateIndex
CREATE INDEX "StorefrontOrder_organizationId_idx" ON "StorefrontOrder"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontOrder_channelId_idx" ON "StorefrontOrder"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontOrder_status_idx" ON "StorefrontOrder"("status");

-- CreateIndex
CREATE INDEX "StorefrontOrder_paymentStatus_idx" ON "StorefrontOrder"("paymentStatus");

-- CreateIndex
CREATE INDEX "StorefrontOrder_displayNumber_idx" ON "StorefrontOrder"("displayNumber");

-- CreateIndex
CREATE INDEX "StorefrontOrder_createdAt_idx" ON "StorefrontOrder"("createdAt");

-- CreateIndex
CREATE INDEX "StorefrontOrderItem_organizationId_idx" ON "StorefrontOrderItem"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontOrderItem_orderId_idx" ON "StorefrontOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "StorefrontOrderItem_publicationId_idx" ON "StorefrontOrderItem"("publicationId");

-- CreateIndex
CREATE INDEX "StorefrontOrderItem_productId_idx" ON "StorefrontOrderItem"("productId");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_organizationId_idx" ON "StorefrontStockReservation"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_channelId_idx" ON "StorefrontStockReservation"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_orderId_idx" ON "StorefrontStockReservation"("orderId");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_publicationId_idx" ON "StorefrontStockReservation"("publicationId");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_status_idx" ON "StorefrontStockReservation"("status");

-- CreateIndex
CREATE INDEX "StorefrontStockReservation_expiresAt_idx" ON "StorefrontStockReservation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPaymentEvent_channelId_eventKey_key" ON "StorefrontPaymentEvent"("channelId", "eventKey");

-- CreateIndex
CREATE INDEX "StorefrontPaymentEvent_organizationId_idx" ON "StorefrontPaymentEvent"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontPaymentEvent_channelId_idx" ON "StorefrontPaymentEvent"("channelId");

-- CreateIndex
CREATE INDEX "StorefrontPaymentEvent_orderId_idx" ON "StorefrontPaymentEvent"("orderId");

-- CreateIndex
CREATE INDEX "StorefrontPaymentEvent_paymentId_idx" ON "StorefrontPaymentEvent"("paymentId");

-- AddForeignKey
ALTER TABLE "StorefrontChannel" ADD CONSTRAINT "StorefrontChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontChannel" ADD CONSTRAINT "StorefrontChannel_defaultPriceListId_fkey" FOREIGN KEY ("defaultPriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontApiKey" ADD CONSTRAINT "StorefrontApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontApiKey" ADD CONSTRAINT "StorefrontApiKey_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPaymentAdjustment" ADD CONSTRAINT "StorefrontPaymentAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPaymentAdjustment" ADD CONSTRAINT "StorefrontPaymentAdjustment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPublication" ADD CONSTRAINT "StorefrontPublication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPublication" ADD CONSTRAINT "StorefrontPublication_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPublication" ADD CONSTRAINT "StorefrontPublication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrder" ADD CONSTRAINT "StorefrontOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrder" ADD CONSTRAINT "StorefrontOrder_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrder" ADD CONSTRAINT "StorefrontOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderItem" ADD CONSTRAINT "StorefrontOrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderItem" ADD CONSTRAINT "StorefrontOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StorefrontOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderItem" ADD CONSTRAINT "StorefrontOrderItem_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "StorefrontPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontOrderItem" ADD CONSTRAINT "StorefrontOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontStockReservation" ADD CONSTRAINT "StorefrontStockReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontStockReservation" ADD CONSTRAINT "StorefrontStockReservation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontStockReservation" ADD CONSTRAINT "StorefrontStockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StorefrontOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontStockReservation" ADD CONSTRAINT "StorefrontStockReservation_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "StorefrontPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontStockReservation" ADD CONSTRAINT "StorefrontStockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPaymentEvent" ADD CONSTRAINT "StorefrontPaymentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPaymentEvent" ADD CONSTRAINT "StorefrontPaymentEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPaymentEvent" ADD CONSTRAINT "StorefrontPaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StorefrontOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
