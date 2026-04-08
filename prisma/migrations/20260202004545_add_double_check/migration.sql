-- AlterTable
ALTER TABLE "AccountMovement" ADD COLUMN     "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "receiptDoubleCheckRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN     "requiresDoubleCheck" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AccountMovement_verifiedByUserId_idx" ON "AccountMovement"("verifiedByUserId");

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
