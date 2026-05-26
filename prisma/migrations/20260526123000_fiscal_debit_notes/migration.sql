-- CreateTable
CREATE TABLE "FiscalDebitNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "fiscalInvoiceId" TEXT,
    "fiscalCreditNoteId" TEXT,
    "debitNumber" TEXT,
    "pointOfSale" TEXT,
    "type" TEXT,
    "cae" TEXT,
    "caeDueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "payloadAfip" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDebitNote_fiscalCreditNoteId_key" ON "FiscalDebitNote"("fiscalCreditNoteId");

-- CreateIndex
CREATE INDEX "FiscalDebitNote_organizationId_idx" ON "FiscalDebitNote"("organizationId");

-- CreateIndex
CREATE INDEX "FiscalDebitNote_saleId_idx" ON "FiscalDebitNote"("saleId");

-- CreateIndex
CREATE INDEX "FiscalDebitNote_fiscalInvoiceId_idx" ON "FiscalDebitNote"("fiscalInvoiceId");

-- CreateIndex
CREATE INDEX "FiscalDebitNote_fiscalCreditNoteId_idx" ON "FiscalDebitNote"("fiscalCreditNoteId");

-- AddForeignKey
ALTER TABLE "FiscalDebitNote" ADD CONSTRAINT "FiscalDebitNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDebitNote" ADD CONSTRAINT "FiscalDebitNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDebitNote" ADD CONSTRAINT "FiscalDebitNote_fiscalInvoiceId_fkey" FOREIGN KEY ("fiscalInvoiceId") REFERENCES "FiscalInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDebitNote" ADD CONSTRAINT "FiscalDebitNote_fiscalCreditNoteId_fkey" FOREIGN KEY ("fiscalCreditNoteId") REFERENCES "FiscalCreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
