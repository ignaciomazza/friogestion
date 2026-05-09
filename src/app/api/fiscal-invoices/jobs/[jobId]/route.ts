import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/tenant";
import { isAuthError } from "@/lib/auth/errors";
import {
  extractJobResolution,
  extractJobWarnings,
  getFiscalInvoiceIssueJob,
  runFiscalIssueQueue,
} from "@/lib/afip/issue-queue";
import { logServerDebug, logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  let meta:
    | {
        organizationId: string;
        jobId: string;
      }
    | undefined;
  try {
    const { membership } = await requireRole(req, [
      "OWNER",
      "ADMIN",
      "SALES",
      "CASHIER",
    ]);
    const params = await context.params;
    meta = { organizationId: membership.organizationId, jobId: params.jobId };

    const queueRun = await runFiscalIssueQueue(membership.organizationId);
    logServerDebug(
      "api.fiscal-invoices.jobs.get.queue-run",
      "Fiscal queue executed from job polling endpoint",
      {
        ...meta,
        queueRunning: queueRun.running,
        processed: queueRun.processed,
      }
    );

    const job = await getFiscalInvoiceIssueJob({
      organizationId: membership.organizationId,
      jobId: params.jobId,
    });
    if (!job) {
      logServerDebug("api.fiscal-invoices.jobs.get.not-found", "Fiscal job not found", meta);
      return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    }
    logServerDebug("api.fiscal-invoices.jobs.get.found", "Fiscal job status returned", {
      ...meta,
      status: job.status,
      hasInvoice: Boolean(job.fiscalInvoice),
    });

    return NextResponse.json({
      id: job.id,
      saleId: job.saleId,
      status: job.status,
      errorCode: job.errorCode,
      error: job.errorMessage,
      resolution: extractJobResolution(job.responsePayload),
      warnings: extractJobWarnings(job.responsePayload),
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      invoice: job.fiscalInvoice
        ? {
            id: job.fiscalInvoice.id,
            saleId: job.fiscalInvoice.saleId,
            type: job.fiscalInvoice.type,
            pointOfSale: job.fiscalInvoice.pointOfSale,
            number: job.fiscalInvoice.number,
            cae: job.fiscalInvoice.cae,
            issuedAt: job.fiscalInvoice.issuedAt?.toISOString() ?? null,
            createdAt: job.fiscalInvoice.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    logServerError("api.fiscal-invoices.jobs.get", error, meta);
    return NextResponse.json(
      { error: "No se pudo recuperar el estado de facturacion" },
      { status: 400 }
    );
  }
}
