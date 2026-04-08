/*
  Warnings:

  - A unique constraint covering the columns `[supplierPaymentLineId]` on the table `AccountMovement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "LedgerCounterpartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('SALE', 'RECEIPT', 'PURCHASE', 'SUPPLIER_PAYMENT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "AccountMovement" ADD COLUMN     "supplierPaymentLineId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentLine" (
    "id" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "accountId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amountBase" DECIMAL(12,2) NOT NULL,
    "fxRateUsed" DECIMAL(18,6),

    CONSTRAINT "SupplierPaymentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentAccountEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counterpartyType" "LedgerCounterpartyType" NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "sourceType" "LedgerSourceType" NOT NULL,
    "saleId" TEXT,
    "receiptId" TEXT,
    "purchaseInvoiceId" TEXT,
    "supplierPaymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrentAccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierPayment_organizationId_idx" ON "SupplierPayment"("organizationId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPaymentLine_supplierPaymentId_idx" ON "SupplierPaymentLine"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_supplierPaymentId_idx" ON "SupplierPaymentAllocation"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_purchaseInvoiceId_idx" ON "SupplierPaymentAllocation"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_organizationId_idx" ON "CurrentAccountEntry"("organizationId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_organizationId_counterpartyType_idx" ON "CurrentAccountEntry"("organizationId", "counterpartyType");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_customerId_idx" ON "CurrentAccountEntry"("customerId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_supplierId_idx" ON "CurrentAccountEntry"("supplierId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_saleId_idx" ON "CurrentAccountEntry"("saleId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_receiptId_idx" ON "CurrentAccountEntry"("receiptId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_purchaseInvoiceId_idx" ON "CurrentAccountEntry"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "CurrentAccountEntry_supplierPaymentId_idx" ON "CurrentAccountEntry"("supplierPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMovement_supplierPaymentLineId_key" ON "AccountMovement"("supplierPaymentLineId");

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_supplierPaymentLineId_fkey" FOREIGN KEY ("supplierPaymentLineId") REFERENCES "SupplierPaymentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentLine" ADD CONSTRAINT "SupplierPaymentLine_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentLine" ADD CONSTRAINT "SupplierPaymentLine_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentLine" ADD CONSTRAINT "SupplierPaymentLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentAccountEntry" ADD CONSTRAINT "CurrentAccountEntry_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
