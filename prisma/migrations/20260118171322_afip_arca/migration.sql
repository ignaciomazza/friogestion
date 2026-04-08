-- CreateEnum
CREATE TYPE "FiscalConfigStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ArcaJobStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING', 'REQUIRES_ACTION', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "ArcaJobStep" AS ENUM ('CREATE_CERT', 'AUTH_WS', 'DONE');

-- CreateEnum
CREATE TYPE "ArcaJobAction" AS ENUM ('CONNECT', 'ROTATE');

-- AlterTable
ALTER TABLE "FiscalInvoice" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "payloadAfip" JSONB;

-- CreateTable
CREATE TABLE "FiscalCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "fiscalInvoiceId" TEXT,
    "creditNumber" TEXT,
    "pointOfSale" TEXT,
    "type" TEXT,
    "cae" TEXT,
    "caeDueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "payloadAfip" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFiscalConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxIdRepresentado" TEXT NOT NULL,
    "taxIdLogin" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "certEncrypted" TEXT,
    "keyEncrypted" TEXT,
    "authorizedServices" TEXT[],
    "status" "FiscalConfigStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "lastOkAt" TIMESTAMP(3),
    "logoUrl" TEXT,
    "logoFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFiscalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcaConnectionJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" "ArcaJobAction" NOT NULL,
    "status" "ArcaJobStatus" NOT NULL,
    "step" "ArcaJobStep" NOT NULL,
    "services" TEXT[],
    "currentServiceIndex" INTEGER NOT NULL DEFAULT 0,
    "longJobId" TEXT,
    "taxIdRepresentado" TEXT NOT NULL,
    "taxIdLogin" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArcaConnectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalCreditNote_organizationId_idx" ON "FiscalCreditNote"("organizationId");

-- CreateIndex
CREATE INDEX "FiscalCreditNote_saleId_idx" ON "FiscalCreditNote"("saleId");

-- CreateIndex
CREATE INDEX "FiscalCreditNote_fiscalInvoiceId_idx" ON "FiscalCreditNote"("fiscalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFiscalConfig_organizationId_key" ON "OrganizationFiscalConfig"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationFiscalConfig_organizationId_idx" ON "OrganizationFiscalConfig"("organizationId");

-- CreateIndex
CREATE INDEX "ArcaConnectionJob_organizationId_idx" ON "ArcaConnectionJob"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationCounter_organizationId_idx" ON "OrganizationCounter"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationCounter_organizationId_key_key" ON "OrganizationCounter"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "FiscalCreditNote" ADD CONSTRAINT "FiscalCreditNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalCreditNote" ADD CONSTRAINT "FiscalCreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalCreditNote" ADD CONSTRAINT "FiscalCreditNote_fiscalInvoiceId_fkey" FOREIGN KEY ("fiscalInvoiceId") REFERENCES "FiscalInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFiscalConfig" ADD CONSTRAINT "OrganizationFiscalConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcaConnectionJob" ADD CONSTRAINT "ArcaConnectionJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCounter" ADD CONSTRAINT "OrganizationCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
