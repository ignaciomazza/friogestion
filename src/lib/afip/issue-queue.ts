import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueFiscalInvoice } from "@/lib/afip/fiscal";
import { mapAfipError } from "@/lib/afip/errors";
import type { ManualTotals } from "@/lib/afip/totals";
import {
  logServerDebug,
  logServerError,
  logServerInfo,
  logServerWarn,
} from "@/lib/server/log";

const LOCK_TTL_MS = 2 * 60 * 1000;

type ServiceDates = {
  from: Date;
  to: Date;
  due?: Date | null;
};

export type FiscalIssueRequest = {
  saleId: string;
  type?: "A" | "B" | null;
  pointOfSale?: number | null;
  docType?: string | number | null;
  docNumber?: string | null;
  serviceDates?: ServiceDates | null;
  currencyCode?: string | null;
  itemsTaxRates?: Array<{ saleItemId: string; rate: number }>;
  manualTotals?: ManualTotals | null;
  issueDate?: Date | null;
  requiresIncomeTaxDeduction?: boolean | null;
};

type FiscalIssueRequestPayload = {
  saleId: string;
  type: "A" | "B" | null;
  pointOfSale?: number | null;
  docType?: string | number | null;
  docNumber?: string | null;
  serviceDates?: {
    from: string;
    to: string;
    due?: string | null;
  } | null;
  currencyCode?: string | null;
  itemsTaxRates?: Array<{ saleItemId: string; rate: number }>;
  manualTotals?: ManualTotals | null;
  issueDate?: string | null;
  requiresIncomeTaxDeduction?: boolean | null;
};

function toJsonObject(value: FiscalIssueRequestPayload): Prisma.JsonObject {
  return value as unknown as Prisma.JsonObject;
}

function serializeRequestPayload(input: FiscalIssueRequest): FiscalIssueRequestPayload {
  return {
    saleId: input.saleId,
    type: input.type ?? null,
    pointOfSale: input.pointOfSale ?? null,
    docType: input.docType ?? null,
    docNumber: input.docNumber ?? null,
    serviceDates: input.serviceDates
      ? {
          from: input.serviceDates.from.toISOString(),
          to: input.serviceDates.to.toISOString(),
          due: input.serviceDates.due ? input.serviceDates.due.toISOString() : null,
        }
      : null,
    currencyCode: input.currencyCode ?? null,
    itemsTaxRates: input.itemsTaxRates ?? [],
    manualTotals: input.manualTotals ?? null,
    issueDate: input.issueDate ? input.issueDate.toISOString() : null,
    requiresIncomeTaxDeduction: input.requiresIncomeTaxDeduction ?? false,
  };
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function deserializeRequestPayload(payload: Prisma.JsonValue): FiscalIssueRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("FISCAL_ISSUE_JOB_PAYLOAD_INVALID");
  }
  const record = payload as Record<string, unknown>;
  const saleId = typeof record.saleId === "string" ? record.saleId : null;
  let type: "A" | "B" | null = null;
  if (record.type === "A" || record.type === "B") {
    type = record.type;
  } else if (record.type !== null && record.type !== undefined) {
    throw new Error("FISCAL_ISSUE_JOB_PAYLOAD_INVALID");
  }
  if (!saleId) {
    throw new Error("FISCAL_ISSUE_JOB_PAYLOAD_INVALID");
  }

  const issueDate = parseDate(record.issueDate);
  const serviceDatesRaw =
    record.serviceDates && typeof record.serviceDates === "object"
      ? (record.serviceDates as Record<string, unknown>)
      : null;
  const from = parseDate(serviceDatesRaw?.from);
  const to = parseDate(serviceDatesRaw?.to);
  const due = parseDate(serviceDatesRaw?.due);
  const serviceDates =
    from && to
      ? {
          from,
          to,
          due: due ?? null,
        }
      : null;

  const itemsTaxRates = Array.isArray(record.itemsTaxRates)
    ? record.itemsTaxRates
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as Record<string, unknown>;
          const saleItemId =
            typeof item.saleItemId === "string" ? item.saleItemId : null;
          const rate = Number(item.rate);
          if (!saleItemId || !Number.isFinite(rate)) return null;
          return { saleItemId, rate };
        })
        .filter(
          (entry): entry is { saleItemId: string; rate: number } => entry !== null
        )
    : undefined;

  const manualTotals =
    record.manualTotals && typeof record.manualTotals === "object"
      ? (record.manualTotals as ManualTotals)
      : null;

  return {
    saleId,
    type,
    pointOfSale:
      record.pointOfSale === null || record.pointOfSale === undefined
        ? null
        : Number(record.pointOfSale),
    docType:
      record.docType === null || record.docType === undefined
        ? null
        : (record.docType as string | number),
    docNumber:
      record.docNumber === null || record.docNumber === undefined
        ? null
        : String(record.docNumber),
    serviceDates,
    currencyCode:
      record.currencyCode === null || record.currencyCode === undefined
        ? null
        : String(record.currencyCode),
    itemsTaxRates,
    manualTotals,
    issueDate,
    requiresIncomeTaxDeduction: Boolean(record.requiresIncomeTaxDeduction),
  };
}

function nextLockExpiry() {
  return new Date(Date.now() + LOCK_TTL_MS);
}

async function tryAcquireQueueLock(organizationId: string, workerToken: string) {
  await prisma.fiscalIssueQueueState.upsert({
    where: { organizationId },
    create: {
      organizationId,
      isRunning: false,
    },
    update: {},
  });

  const now = new Date();
  const claimed = await prisma.fiscalIssueQueueState.updateMany({
    where: {
      organizationId,
      OR: [{ isRunning: false }, { lockExpiresAt: { lt: now } }],
    },
    data: {
      isRunning: true,
      workerToken,
      lockExpiresAt: nextLockExpiry(),
    },
  });

  return claimed.count > 0;
}

async function refreshQueueLock(organizationId: string, workerToken: string) {
  await prisma.fiscalIssueQueueState.updateMany({
    where: { organizationId, workerToken, isRunning: true },
    data: { lockExpiresAt: nextLockExpiry() },
  });
}

async function releaseQueueLock(organizationId: string, workerToken: string) {
  await prisma.fiscalIssueQueueState.updateMany({
    where: { organizationId, workerToken },
    data: {
      isRunning: false,
      workerToken: null,
      lockExpiresAt: null,
    },
  });
}

async function claimNextPendingJob(organizationId: string, workerToken: string) {
  return prisma.$transaction(async (tx) => {
    const state = await tx.fiscalIssueQueueState.findUnique({
      where: { organizationId },
      select: { isRunning: true, workerToken: true },
    });
    if (!state?.isRunning || state.workerToken !== workerToken) {
      return null;
    }

    const nextJob = await tx.fiscalInvoiceIssueJob.findFirst({
      where: {
        organizationId,
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!nextJob) return null;

    return tx.fiscalInvoiceIssueJob.update({
      where: { id: nextJob.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });
}

async function markJobAsError(
  jobId: string,
  mapped: {
    code: string;
    error: string;
    details?: string;
    resolution?: Record<string, unknown>;
  }
) {
  logServerWarn("fiscal.issue-queue.job.error", mapped.error, {
    jobId,
    code: mapped.code,
    details: mapped.details ?? null,
  });
  await prisma.fiscalInvoiceIssueJob.update({
    where: { id: jobId },
    data: {
      status: "ERROR",
      errorCode: mapped.code,
      errorMessage: mapped.error,
      responsePayload: mapped.details || mapped.resolution
        ? ({
            details: mapped.details ?? null,
            resolution: mapped.resolution ?? null,
          } as Prisma.JsonObject)
        : Prisma.DbNull,
      finishedAt: new Date(),
    },
  });
}

async function processJob(jobId: string) {
  logServerDebug("fiscal.issue-queue.job.start", "Processing fiscal issue job", {
    jobId,
  });
  const job = await prisma.fiscalInvoiceIssueJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      organizationId: true,
      saleId: true,
      requestPayload: true,
    },
  });
  if (!job) return;

  let request: FiscalIssueRequest;
  try {
    request = deserializeRequestPayload(job.requestPayload);
  } catch (error) {
    logServerError("fiscal.issue-queue.job.payload", error, { jobId: job.id });
    const mapped = mapAfipError(error);
    await markJobAsError(job.id, mapped);
    return;
  }

  try {
    const result = await issueFiscalInvoice({
      organizationId: job.organizationId,
      ...request,
    });
    await prisma.fiscalInvoiceIssueJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        fiscalInvoiceId: result.invoice.id,
        responsePayload: {
          warnings: result.warnings,
          invoiceId: result.invoice.id,
        } as Prisma.JsonObject,
        errorCode: null,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
    logServerDebug("fiscal.issue-queue.job.completed", "Fiscal issue job completed", {
      jobId: job.id,
      saleId: job.saleId,
      fiscalInvoiceId: result.invoice.id,
      warnings: result.warnings.length,
    });
  } catch (error) {
    logServerError("fiscal.issue-queue.job.failed", error, {
      jobId: job.id,
      saleId: job.saleId,
    });
    const mapped = mapAfipError(error);
    if (mapped.code === "SALE_ALREADY_BILLED") {
      const existingInvoice = await prisma.fiscalInvoice.findFirst({
        where: { organizationId: job.organizationId, saleId: job.saleId },
        select: { id: true },
      });
      if (existingInvoice) {
        await prisma.fiscalInvoiceIssueJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            fiscalInvoiceId: existingInvoice.id,
            responsePayload: { warnings: [], invoiceId: existingInvoice.id } as Prisma.JsonObject,
            errorCode: null,
            errorMessage: null,
            finishedAt: new Date(),
          },
        });
        logServerInfo(
          "fiscal.issue-queue.job.reused-invoice",
          "Reused existing fiscal invoice for already billed sale",
          {
            jobId: job.id,
            saleId: job.saleId,
            fiscalInvoiceId: existingInvoice.id,
          }
        );
        return;
      }
    }

    await markJobAsError(job.id, mapped);
  }
}

export async function enqueueFiscalInvoiceIssueJob(input: {
  organizationId: string;
  request: FiscalIssueRequest;
}) {
  const payload = serializeRequestPayload(input.request);
  const existing = await prisma.fiscalInvoiceIssueJob.findUnique({
    where: { saleId: input.request.saleId },
  });
  if (existing) {
    if (existing.organizationId !== input.organizationId) {
      throw new Error("FISCAL_ISSUE_JOB_ORG_CONFLICT");
    }
    if (existing.status === "ERROR") {
      const requeued = await prisma.fiscalInvoiceIssueJob.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          requestPayload: toJsonObject(payload),
          responsePayload: Prisma.DbNull,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      logServerInfo(
        "fiscal.issue-queue.enqueue.requeued",
        "Requeued previous failed fiscal issue job",
        {
          jobId: requeued.id,
          saleId: requeued.saleId,
        }
      );
      return requeued;
    }
    logServerDebug(
      "fiscal.issue-queue.enqueue.reuse-existing",
      "Reused existing fiscal issue job",
      {
        jobId: existing.id,
        saleId: existing.saleId,
        status: existing.status,
      }
    );
    return existing;
  }

  try {
    const created = await prisma.fiscalInvoiceIssueJob.create({
      data: {
        organizationId: input.organizationId,
        saleId: input.request.saleId,
        status: "PENDING",
        requestPayload: toJsonObject(payload),
      },
    });
    logServerInfo("fiscal.issue-queue.enqueue.created", "Created fiscal issue job", {
      jobId: created.id,
      saleId: created.saleId,
    });
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.fiscalInvoiceIssueJob.findUnique({
        where: { saleId: input.request.saleId },
      });
      if (!existing) {
        throw error;
      }
      if (existing.organizationId !== input.organizationId) {
        throw new Error("FISCAL_ISSUE_JOB_ORG_CONFLICT");
      }
      if (existing.status === "ERROR") {
        const requeued = await prisma.fiscalInvoiceIssueJob.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            requestPayload: toJsonObject(payload),
            responsePayload: Prisma.DbNull,
            errorCode: null,
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
          },
        });
        logServerInfo(
          "fiscal.issue-queue.enqueue.requeued-race",
          "Requeued failed fiscal issue job after create race",
          {
            jobId: requeued.id,
            saleId: requeued.saleId,
          }
        );
        return requeued;
      }
      logServerDebug(
        "fiscal.issue-queue.enqueue.reuse-existing-race",
        "Reused existing fiscal issue job after create race",
        {
          jobId: existing.id,
          saleId: existing.saleId,
          status: existing.status,
        }
      );
      return existing;
    }
    throw error;
  }
}

export async function runFiscalIssueQueue(organizationId: string) {
  const workerToken = randomUUID();
  const acquired = await tryAcquireQueueLock(organizationId, workerToken);
  if (!acquired) {
    logServerDebug(
      "fiscal.issue-queue.lock.skipped",
      "Fiscal queue worker skipped because lock is already acquired",
      {
        organizationId,
      }
    );
    return { running: false, processed: 0 };
  }

  logServerDebug("fiscal.issue-queue.lock.acquired", "Fiscal queue lock acquired", {
    organizationId,
    workerToken,
  });
  let processed = 0;
  try {
    for (;;) {
      await refreshQueueLock(organizationId, workerToken);
      const job = await claimNextPendingJob(organizationId, workerToken);
      if (!job) break;
      await processJob(job.id);
      processed += 1;
    }
    logServerDebug("fiscal.issue-queue.run.completed", "Fiscal queue run completed", {
      organizationId,
      workerToken,
      processed,
    });
    return { running: true, processed };
  } finally {
    await releaseQueueLock(organizationId, workerToken);
    logServerDebug("fiscal.issue-queue.lock.released", "Fiscal queue lock released", {
      organizationId,
      workerToken,
      processed,
    });
  }
}

export async function getFiscalInvoiceIssueJob(input: {
  organizationId: string;
  jobId: string;
}) {
  return prisma.fiscalInvoiceIssueJob.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
    },
    include: {
      fiscalInvoice: {
        select: {
          id: true,
          saleId: true,
          type: true,
          pointOfSale: true,
          number: true,
          cae: true,
          issuedAt: true,
          createdAt: true,
        },
      },
    },
  });
}

export function extractJobWarnings(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [] as string[];
  }
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.warnings)) {
    return [] as string[];
  }
  return record.warnings.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

export function extractJobResolution(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const resolution = (payload as Record<string, unknown>).resolution;
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    return null;
  }
  return resolution;
}
