-- Cola de emision fiscal por organizacion
CREATE TYPE "FiscalIssueJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'ERROR');

CREATE TABLE "FiscalInvoiceIssueJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "fiscalInvoiceId" TEXT,
  "status" "FiscalIssueJobStatus" NOT NULL DEFAULT 'PENDING',
  "requestPayload" JSONB NOT NULL,
  "responsePayload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FiscalInvoiceIssueJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalIssueQueueState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "isRunning" BOOLEAN NOT NULL DEFAULT false,
  "workerToken" TEXT,
  "lockExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FiscalIssueQueueState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalInvoiceIssueJob_saleId_key" ON "FiscalInvoiceIssueJob"("saleId");
CREATE UNIQUE INDEX "FiscalInvoiceIssueJob_fiscalInvoiceId_key" ON "FiscalInvoiceIssueJob"("fiscalInvoiceId");
CREATE INDEX "FiscalInvoiceIssueJob_organizationId_status_createdAt_idx" ON "FiscalInvoiceIssueJob"("organizationId", "status", "createdAt");
CREATE INDEX "FiscalInvoiceIssueJob_createdAt_idx" ON "FiscalInvoiceIssueJob"("createdAt");

CREATE UNIQUE INDEX "FiscalIssueQueueState_organizationId_key" ON "FiscalIssueQueueState"("organizationId");
CREATE INDEX "FiscalIssueQueueState_organizationId_isRunning_idx" ON "FiscalIssueQueueState"("organizationId", "isRunning");
CREATE INDEX "FiscalIssueQueueState_lockExpiresAt_idx" ON "FiscalIssueQueueState"("lockExpiresAt");

ALTER TABLE "FiscalInvoiceIssueJob"
  ADD CONSTRAINT "FiscalInvoiceIssueJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalInvoiceIssueJob"
  ADD CONSTRAINT "FiscalInvoiceIssueJob_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalInvoiceIssueJob"
  ADD CONSTRAINT "FiscalInvoiceIssueJob_fiscalInvoiceId_fkey"
  FOREIGN KEY ("fiscalInvoiceId") REFERENCES "FiscalInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FiscalIssueQueueState"
  ADD CONSTRAINT "FiscalIssueQueueState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
