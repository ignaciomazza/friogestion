-- Condicion fiscal del cliente para definir tipo de factura automaticamente
CREATE TYPE "CustomerFiscalTaxProfile" AS ENUM (
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTISTA',
  'CONSUMIDOR_FINAL'
);

ALTER TABLE "Customer"
ADD COLUMN "fiscalTaxProfile" "CustomerFiscalTaxProfile" NOT NULL DEFAULT 'CONSUMIDOR_FINAL';

UPDATE "Customer"
SET "fiscalTaxProfile" = CASE
  WHEN "type" = 'CONSUMER_FINAL' THEN 'CONSUMIDOR_FINAL'::"CustomerFiscalTaxProfile"
  ELSE 'MONOTRIBUTISTA'::"CustomerFiscalTaxProfile"
END;
