-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierRetentionType" AS ENUM ('VAT', 'INCOME', 'IIBB', 'OTHER');

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "withheldTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplierPaymentRetention" (
    "id" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "type" "SupplierRetentionType" NOT NULL,
    "baseAmount" DECIMAL(12,2),
    "rate" DECIMAL(5,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "SupplierPaymentRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashReconciliation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashReconciliationLine" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "countedAmount" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "CashReconciliationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierPaymentRetention_supplierPaymentId_idx" ON "SupplierPaymentRetention"("supplierPaymentId");

-- CreateIndex
CREATE INDEX "CashReconciliation_organizationId_idx" ON "CashReconciliation"("organizationId");

-- CreateIndex
CREATE INDEX "CashReconciliation_createdByUserId_idx" ON "CashReconciliation"("createdByUserId");

-- CreateIndex
CREATE INDEX "CashReconciliationLine_reconciliationId_idx" ON "CashReconciliationLine"("reconciliationId");

-- CreateIndex
CREATE INDEX "CashReconciliationLine_accountId_idx" ON "CashReconciliationLine"("accountId");

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentRetention" ADD CONSTRAINT "SupplierPaymentRetention_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReconciliation" ADD CONSTRAINT "CashReconciliation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReconciliation" ADD CONSTRAINT "CashReconciliation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReconciliationLine" ADD CONSTRAINT "CashReconciliationLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CashReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReconciliationLine" ADD CONSTRAINT "CashReconciliationLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
