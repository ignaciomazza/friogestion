import type { ArcaConnectionJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto/secrets";
import { getArcaClient, getArcaEnvironment } from "@/lib/arca/client";
import { clearJobPassword, getJobPassword } from "@/lib/arca/password-cache";
import { dedupeServices } from "@/lib/arca/utils";
import { invalidateAfipClient } from "@/lib/afip/cache";

type ArcaResponse = {
  id?: string;
  status?: string;
  data?: Record<string, unknown>;
  long_job_id?: string;
  message?: string;
  error?: string | Record<string, unknown>;
  errors?: unknown;
  detail?: string;
  details?: unknown;
  [key: string]: unknown;
};

type AfipAdminClient = {
  post: (
    endpoint: string,
    payload: Record<string, unknown>
  ) => Promise<{ data: ArcaResponse }>;
};

type AfipAdminCarrier = { AdminClient: AfipAdminClient };

const SENSITIVE_FIELD = /password|clave|secret|token|cert|key/i;
const AUTO_RETRY_ATTEMPTS = 6;
const AUTO_RETRY_DELAY_MS = 1500;

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function describeKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).slice(0, 6);
  if (!keys.length) return null;
  return `ARCA_RESPONSE_INVALID (${keys.join(", ")})`;
}

function maskIfSensitive(field: string, value: string) {
  if (SENSITIVE_FIELD.test(field)) return "[redacted]";
  return value;
}

function extractErrorsMessage(errors: unknown): string | null {
  if (!errors) return null;

  const direct = asNonEmptyString(errors);
  if (direct) return direct;

  if (Array.isArray(errors)) {
    const parts = errors
      .map((item) => {
        const text = asNonEmptyString(item);
        if (text) return text;
        if (item && typeof item === "object") {
          return extractArcaMessage(item);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));

    return parts.length ? parts.join(" | ") : null;
  }

  if (errors && typeof errors === "object") {
    const pairs = Object.entries(errors as Record<string, unknown>);
    const messages = pairs
      .map(([field, raw]) => {
        if (Array.isArray(raw)) {
          const values = raw
            .map((item) => asNonEmptyString(item))
            .filter((item): item is string => Boolean(item))
            .map((item) => maskIfSensitive(field, item));

          if (!values.length) return null;
          return `${field}: ${values.join(", ")}`;
        }

        const text = asNonEmptyString(raw);
        if (text) return `${field}: ${maskIfSensitive(field, text)}`;

        const nested = extractArcaMessage(raw);
        if (nested) return `${field}: ${maskIfSensitive(field, nested)}`;

        return null;
      })
      .filter((item): item is string => Boolean(item));

    return messages.length ? messages.join(" | ") : null;
  }

  return null;
}

function extractArcaMessage(payload: unknown): string | null {
  const direct = asNonEmptyString(payload);
  if (direct) return direct;

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  const fromCandidates =
    asNonEmptyString(record.message) ??
    asNonEmptyString(record.error) ??
    asNonEmptyString(record.detail) ??
    asNonEmptyString(record.description);

  if (fromCandidates) return fromCandidates;

  const nestedError =
    record.error && typeof record.error === "object"
      ? extractArcaMessage(record.error)
      : null;

  if (nestedError) return nestedError;

  const fromErrors =
    extractErrorsMessage(record.errors) ??
    extractErrorsMessage(record.details);

  if (fromErrors) return fromErrors;

  const nestedData =
    record.data && typeof record.data === "object"
      ? extractArcaMessage(record.data)
      : null;

  if (nestedData) return nestedData;

  return describeKeys(record);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const errorWithData = error as Error & {
      data?: unknown;
      status?: number;
      statusText?: string;
    };

    const fromPayload = extractArcaMessage(errorWithData.data);
    if (fromPayload) return fromPayload;

    if (errorWithData.status) {
      const statusText = asNonEmptyString(errorWithData.statusText);
      return statusText
        ? `ARCA_HTTP_${errorWithData.status}: ${statusText}`
        : `ARCA_HTTP_${errorWithData.status}`;
    }

    return error.message;
  }
  return "ARCA_REQUEST_FAILED";
}

function getResponseMessage(response: ArcaResponse | null) {
  return extractArcaMessage(response) ?? "ARCA_RESPONSE_INVALID";
}

function normalizeResponseStatus(status: unknown) {
  const value = asNonEmptyString(status);
  return value ? value.toLowerCase() : null;
}

function getAsyncRequestId(data: ArcaResponse) {
  return (
    asNonEmptyString(data.long_job_id) ??
    asNonEmptyString(data.id) ??
    asNonEmptyString(data.data?.long_job_id) ??
    asNonEmptyString(data.data?.id) ??
    null
  );
}

function isCompleteStatus(status: string | null) {
  return Boolean(
    status &&
      ["complete", "completed", "done", "success", "ok"].includes(status)
  );
}

function isErrorStatus(status: string | null) {
  return Boolean(
    status &&
      ["error", "failed", "failure", "rejected", "denied", "cancelled"].some(
        (flag) => status.includes(flag)
      )
  );
}

function shouldWaitResponse(data: ArcaResponse) {
  const status = normalizeResponseStatus(data.status);
  if (isCompleteStatus(status)) return false;
  if (isErrorStatus(status)) return false;
  if (getAsyncRequestId(data)) return true;
  return Boolean(
    status &&
      [
        "pending",
        "waiting",
        "processing",
        "running",
        "in_progress",
        "in-progress",
        "queued",
      ].includes(status)
  );
}

async function updateConfigError(organizationId: string, message: string) {
  await prisma.organizationFiscalConfig.updateMany({
    where: { organizationId },
    data: { status: "ERROR", lastError: message },
  });
}

async function upsertConfigFromJob(
  job: ArcaConnectionJob,
  updates: Partial<Omit<ArcaConnectionJob, "status">> & {
    certEncrypted?: string | null;
    keyEncrypted?: string | null;
    authorizedServices?: string[];
    status?: "PENDING" | "CONNECTED" | "ERROR";
    lastError?: string | null;
    lastOkAt?: Date | null;
  }
) {
  const authorizedServices =
    updates.authorizedServices ?? dedupeServices(job.services);

  return prisma.organizationFiscalConfig.upsert({
    where: { organizationId: job.organizationId },
    create: {
      organizationId: job.organizationId,
      taxIdRepresentado: job.taxIdRepresentado,
      taxIdLogin: job.taxIdLogin,
      alias: job.alias,
      certEncrypted: updates.certEncrypted ?? null,
      keyEncrypted: updates.keyEncrypted ?? null,
      authorizedServices,
      status: updates.status ?? "PENDING",
      lastError: updates.lastError ?? null,
      lastOkAt: updates.lastOkAt ?? null,
    },
    update: {
      taxIdRepresentado: job.taxIdRepresentado,
      taxIdLogin: job.taxIdLogin,
      alias: job.alias,
      certEncrypted: updates.certEncrypted ?? undefined,
      keyEncrypted: updates.keyEncrypted ?? undefined,
      authorizedServices,
      status: updates.status ?? undefined,
      lastError:
        updates.lastError === undefined ? undefined : updates.lastError,
      lastOkAt: updates.lastOkAt ?? undefined,
    },
  });
}

async function requestArca(
  job: ArcaConnectionJob,
  endpoint: string,
  payload: Record<string, unknown>
) {
  const client = getArcaClient(job.taxIdRepresentado);
  const environment = getArcaEnvironment();
  const adminClient = (client as unknown as AfipAdminCarrier).AdminClient;

  try {
    const result = await adminClient.post(endpoint, {
      environment,
      tax_id: Number(job.taxIdRepresentado),
      ...payload,
    });

    return { ok: true as const, data: result.data as ArcaResponse };
  } catch (error) {
    return { ok: false as const, error: getErrorMessage(error) };
  }
}

function buildAsyncPayload(processId?: string | null) {
  if (!processId) return {};
  return {
    long_job_id: processId,
    id: processId,
  };
}

async function handleCreateCert(job: ArcaConnectionJob) {
  const password = getJobPassword(job.id);
  if (!password) {
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: { status: "REQUIRES_ACTION", lastError: "PASSWORD_REQUIRED" },
    });
  }

  const response = await requestArca(job, "v1/afip/certs", {
    username: job.taxIdLogin,
    password,
    alias: job.alias,
    ...buildAsyncPayload(job.longJobId),
  });

  if (!response.ok) {
    await updateConfigError(job.organizationId, response.error);
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: { status: "ERROR", lastError: response.error },
    });
  }

  const data = response.data;
  if (!data) {
    const message = getResponseMessage(data ?? null);
    await updateConfigError(job.organizationId, message);
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: { status: "ERROR", lastError: message },
    });
  }

  const status = normalizeResponseStatus(data.status);

  if (isCompleteStatus(status)) {
    const cert = data.data?.cert;
    const key = data.data?.key;
    if (typeof cert !== "string" || typeof key !== "string") {
      const message = "ARCA_CERT_RESPONSE_INVALID";
      await updateConfigError(job.organizationId, message);
      return prisma.arcaConnectionJob.update({
        where: { id: job.id },
        data: { status: "ERROR", lastError: message },
      });
    }

    const certEncrypted = encryptSecret(cert);
    const keyEncrypted = encryptSecret(key);

    await upsertConfigFromJob(job, {
      certEncrypted,
      keyEncrypted,
      status: "PENDING",
      lastError: null,
      lastOkAt: new Date(),
    });

    invalidateAfipClient(job.organizationId);

    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        step: "AUTH_WS",
        longJobId: null,
        lastError: null,
      },
    });
  }

  if (shouldWaitResponse(data)) {
    const processId = getAsyncRequestId(data) ?? job.longJobId;
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: {
        status: "WAITING",
        longJobId: processId,
        lastError: null,
      },
    });
  }

  const message = getResponseMessage(data);
  await updateConfigError(job.organizationId, message);
  return prisma.arcaConnectionJob.update({
    where: { id: job.id },
    data: { status: "ERROR", lastError: message },
  });
}

async function handleAuthWs(job: ArcaConnectionJob) {
  const password = getJobPassword(job.id);
  if (!password) {
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: { status: "REQUIRES_ACTION", lastError: "PASSWORD_REQUIRED" },
    });
  }

  const services = dedupeServices(job.services);
  let currentIndex = job.currentServiceIndex;
  let longJobId = job.longJobId;

  while (currentIndex < services.length) {
    const wsid = services[currentIndex];
    const response = await requestArca(job, "v1/afip/ws-auths", {
      username: job.taxIdLogin,
      password,
      alias: job.alias,
      wsid,
      ...buildAsyncPayload(longJobId),
    });

    if (!response.ok) {
      await updateConfigError(job.organizationId, response.error);
      return prisma.arcaConnectionJob.update({
        where: { id: job.id },
        data: { status: "ERROR", lastError: response.error },
      });
    }

    const data = response.data;
    if (!data) {
      const message = getResponseMessage(data ?? null);
      await updateConfigError(job.organizationId, message);
      return prisma.arcaConnectionJob.update({
        where: { id: job.id },
        data: { status: "ERROR", lastError: message },
      });
    }

    const status = normalizeResponseStatus(data.status);

    if (isCompleteStatus(status)) {
      currentIndex += 1;
      longJobId = null;

      await prisma.arcaConnectionJob.update({
        where: { id: job.id },
        data: {
          currentServiceIndex: currentIndex,
          longJobId,
          lastError: null,
        },
      });

      await upsertConfigFromJob(job, {
        authorizedServices: dedupeServices([...services.slice(0, currentIndex)]),
        status: "PENDING",
        lastError: null,
        lastOkAt: new Date(),
      });
      continue;
    }

    if (shouldWaitResponse(data)) {
      longJobId = getAsyncRequestId(data) ?? longJobId;
      return prisma.arcaConnectionJob.update({
        where: { id: job.id },
        data: {
          status: "WAITING",
          longJobId,
          lastError: null,
        },
      });
    }

    const message = getResponseMessage(data);
    await updateConfigError(job.organizationId, message);
    return prisma.arcaConnectionJob.update({
      where: { id: job.id },
      data: { status: "ERROR", lastError: message },
    });
  }

  await upsertConfigFromJob(job, {
    authorizedServices: services,
    status: "CONNECTED",
    lastError: null,
    lastOkAt: new Date(),
  });

  clearJobPassword(job.id);

  return prisma.arcaConnectionJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      step: "DONE",
      completedAt: new Date(),
      lastError: null,
    },
  });
}

export async function runArcaJob(jobId: string) {
  const executeStep = async (currentJob: ArcaConnectionJob) => {
    if (currentJob.step === "CREATE_CERT") {
      return handleCreateCert(currentJob);
    }
    if (currentJob.step === "AUTH_WS") {
      return handleAuthWs(currentJob);
    }
    return currentJob;
  };

  const job = await prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error("ARCA_JOB_NOT_FOUND");
  }

  if (job.status === "COMPLETED") {
    return job;
  }

  await prisma.arcaConnectionJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", lastError: null },
  });

  let updated = await executeStep(job);

  for (let attempt = 0; attempt < AUTO_RETRY_ATTEMPTS; attempt += 1) {
    if (updated.status !== "WAITING") break;

    await new Promise((resolve) => setTimeout(resolve, AUTO_RETRY_DELAY_MS));
    await prisma.arcaConnectionJob.update({
      where: { id: updated.id },
      data: { status: "RUNNING", lastError: null },
    });

    const current = await prisma.arcaConnectionJob.findUnique({
      where: { id: updated.id },
    });
    if (!current) {
      throw new Error("ARCA_JOB_NOT_FOUND");
    }

    updated = await executeStep(current);
  }

  return updated;
}
