CREATE TABLE "OperationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationEvent_organizationId_createdAt_idx" ON "OperationEvent"("organizationId", "createdAt");
CREATE INDEX "OperationEvent_organizationId_entityType_entityId_idx" ON "OperationEvent"("organizationId", "entityType", "entityId");
CREATE INDEX "OperationEvent_actorUserId_idx" ON "OperationEvent"("actorUserId");
CREATE INDEX "OperationEvent_expiresAt_idx" ON "OperationEvent"("expiresAt");

ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
