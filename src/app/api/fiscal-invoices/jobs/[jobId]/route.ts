import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/tenant";
import { isAuthError } from "@/lib/auth/errors";
import {
  extractJobWarnings,
  getFiscalInvoiceIssueJob,
  runFiscalIssueQueue,
} from "@/lib/afip/issue-queue";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { membership } = await requireRole(req, [
      "OWNER",
      "ADMIN",
      "SALES",
      "CASHIER",
    ]);
    const params = await context.params;

    await runFiscalIssueQueue(membership.organizationId);

    const job = await getFiscalInvoiceIssueJob({
      organizationId: membership.organizationId,
      jobId: params.jobId,
    });
    if (!job) {
      return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      saleId: job.saleId,
      status: job.status,
      errorCode: job.errorCode,
      error: job.errorMessage,
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
    return NextResponse.json(
      { error: "No se pudo recuperar el estado de facturacion" },
      { status: 400 }
    );
  }
}
