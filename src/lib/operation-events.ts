import type { Prisma } from "@prisma/client";

const DEFAULT_RETENTION_DAYS = 180;

type OperationEventClient = Pick<Prisma.TransactionClient, "operationEvent">;

type OperationEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  retentionDays?: number | null;
};

const resolveRetentionDays = (override?: number | null) => {
  if (override === null) return null;
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(Math.trunc(override), 1);
  }

  const fromEnv = Number(process.env.OPERATION_EVENT_RETENTION_DAYS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.trunc(fromEnv);
  }

  return DEFAULT_RETENTION_DAYS;
};

const resolveExpiresAt = (retentionDays?: number | null) => {
  const days = resolveRetentionDays(retentionDays);
  if (days === null) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
};

const toJsonInput = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return { unavailable: true } satisfies Prisma.JsonObject;
  }
};

export async function recordOperationEvent(
  tx: OperationEventClient,
  input: OperationEventInput,
) {
  const before = toJsonInput(input.before);
  const after = toJsonInput(input.after);
  const metadata = toJsonInput(input.metadata);

  await tx.operationEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      expiresAt: resolveExpiresAt(input.retentionDays),
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    },
  });
}
