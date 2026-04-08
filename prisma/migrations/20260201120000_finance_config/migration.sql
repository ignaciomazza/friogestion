-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('CASH', 'BANK', 'VIRTUAL');

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "receiptApprovalRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "FinanceAccount"
ADD COLUMN "type" "FinanceAccountType" NOT NULL DEFAULT 'CASH',
ADD COLUMN "bankName" TEXT,
ADD COLUMN "accountNumber" TEXT,
ADD COLUMN "cbu" TEXT,
ADD COLUMN "alias" TEXT;

-- AlterTable
ALTER TABLE "PaymentMethod"
ADD COLUMN "type" "PaymentMethodType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- Data updates for existing rows
UPDATE "FinanceAccount"
SET "type" = 'BANK'
WHERE LOWER("name") LIKE '%banco%';

UPDATE "PaymentMethod"
SET "type" = 'CASH'
WHERE LOWER("name") LIKE '%efectivo%';

UPDATE "PaymentMethod"
SET "type" = 'TRANSFER'
WHERE LOWER("name") LIKE '%transfer%';

UPDATE "PaymentMethod"
SET "type" = 'CARD'
WHERE LOWER("name") LIKE '%tarjeta%';

UPDATE "PaymentMethod"
SET "type" = 'CHECK'
WHERE LOWER("name") LIKE '%cheque%';

UPDATE "Organization"
SET "receiptApprovalRoles" = ARRAY['OWNER']::TEXT[]
WHERE "receiptApprovalRoles" = ARRAY[]::TEXT[];
