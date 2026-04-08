-- CreateEnum
CREATE TYPE "SupplierArcaVerificationStatus" AS ENUM ('PENDING', 'MATCH', 'PARTIAL', 'MISMATCH', 'NO_ENCONTRADO', 'ERROR');

-- CreateEnum
CREATE TYPE "PurchaseArcaValidationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'OBSERVED', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DeliveryNoteType" AS ENUM ('R', 'X');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Supplier"
ADD COLUMN "arcaVerificationStatus" "SupplierArcaVerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "arcaVerificationCheckedAt" TIMESTAMP(3),
ADD COLUMN "arcaVerificationMessage" TEXT,
ADD COLUMN "arcaVerificationSnapshot" JSONB;

-- AlterTable
ALTER TABLE "PurchaseInvoice"
ADD COLUMN "arcaValidationStatus" "PurchaseArcaValidationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "arcaValidationCheckedAt" TIMESTAMP(3),
ADD COLUMN "arcaValidationMessage" TEXT,
ADD COLUMN "arcaValidationRequest" JSONB,
ADD COLUMN "arcaValidationResponse" JSONB;

-- CreateTable
CREATE TABLE "ArcaTaxpayerLookupCache" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArcaTaxpayerLookupCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierArcaVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "taxId" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "status" "SupplierArcaVerificationStatus" NOT NULL,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierArcaVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseArcaValidation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "status" "PurchaseArcaValidationStatus" NOT NULL,
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseArcaValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DeliveryNoteType" NOT NULL,
    "pointOfSale" INTEGER NOT NULL,
    "number" INTEGER,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "customerId" TEXT,
    "supplierId" TEXT,
    "saleId" TEXT,
    "purchaseInvoiceId" TEXT,
    "observations" TEXT,
    "digitalRepresentation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_organizationId_arcaVerificationStatus_idx" ON "Supplier"("organizationId", "arcaVerificationStatus");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_organizationId_arcaValidationStatus_idx" ON "PurchaseInvoice"("organizationId", "arcaValidationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ArcaTaxpayerLookupCache_organizationId_taxId_key" ON "ArcaTaxpayerLookupCache"("organizationId", "taxId");

-- CreateIndex
CREATE INDEX "ArcaTaxpayerLookupCache_organizationId_idx" ON "ArcaTaxpayerLookupCache"("organizationId");

-- CreateIndex
CREATE INDEX "ArcaTaxpayerLookupCache_expiresAt_idx" ON "ArcaTaxpayerLookupCache"("expiresAt");

-- CreateIndex
CREATE INDEX "SupplierArcaVerification_organizationId_idx" ON "SupplierArcaVerification"("organizationId");

-- CreateIndex
CREATE INDEX "SupplierArcaVerification_supplierId_idx" ON "SupplierArcaVerification"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierArcaVerification_taxId_idx" ON "SupplierArcaVerification"("taxId");

-- CreateIndex
CREATE INDEX "SupplierArcaVerification_checkedAt_idx" ON "SupplierArcaVerification"("checkedAt");

-- CreateIndex
CREATE INDEX "SupplierArcaVerification_status_idx" ON "SupplierArcaVerification"("status");

-- CreateIndex
CREATE INDEX "PurchaseArcaValidation_organizationId_idx" ON "PurchaseArcaValidation"("organizationId");

-- CreateIndex
CREATE INDEX "PurchaseArcaValidation_purchaseInvoiceId_idx" ON "PurchaseArcaValidation"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseArcaValidation_checkedAt_idx" ON "PurchaseArcaValidation"("checkedAt");

-- CreateIndex
CREATE INDEX "PurchaseArcaValidation_status_idx" ON "PurchaseArcaValidation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_organizationId_type_pointOfSale_number_key" ON "DeliveryNote"("organizationId", "type", "pointOfSale", "number");

-- CreateIndex
CREATE INDEX "DeliveryNote_organizationId_idx" ON "DeliveryNote"("organizationId");

-- CreateIndex
CREATE INDEX "DeliveryNote_status_idx" ON "DeliveryNote"("status");

-- CreateIndex
CREATE INDEX "DeliveryNote_customerId_idx" ON "DeliveryNote"("customerId");

-- CreateIndex
CREATE INDEX "DeliveryNote_supplierId_idx" ON "DeliveryNote"("supplierId");

-- CreateIndex
CREATE INDEX "DeliveryNote_saleId_idx" ON "DeliveryNote"("saleId");

-- CreateIndex
CREATE INDEX "DeliveryNote_purchaseInvoiceId_idx" ON "DeliveryNote"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_productId_idx" ON "DeliveryNoteItem"("productId");

-- AddForeignKey
ALTER TABLE "ArcaTaxpayerLookupCache" ADD CONSTRAINT "ArcaTaxpayerLookupCache_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierArcaVerification" ADD CONSTRAINT "SupplierArcaVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierArcaVerification" ADD CONSTRAINT "SupplierArcaVerification_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierArcaVerification" ADD CONSTRAINT "SupplierArcaVerification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseArcaValidation" ADD CONSTRAINT "PurchaseArcaValidation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseArcaValidation" ADD CONSTRAINT "PurchaseArcaValidation_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseArcaValidation" ADD CONSTRAINT "PurchaseArcaValidation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
