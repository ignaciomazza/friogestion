ALTER TABLE "Customer"
ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "Customer_organizationId_systemKey_key"
ON "Customer"("organizationId", "systemKey");
