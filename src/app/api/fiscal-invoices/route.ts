import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { mapAfipError } from "@/lib/afip/errors";
import {
  enqueueFiscalInvoiceIssueJob,
  extractJobWarnings,
  getFiscalInvoiceIssueJob,
  runFiscalIssueQueue,
} from "@/lib/afip/issue-queue";
import { isAuthError } from "@/lib/auth/errors";
import { parseOptionalDate } from "@/lib/validation";

export const runtime = "nodejs";

const manualTotalsSchema = z.object({
  net: z.coerce.number(),
  iva: z.coerce.number(),
  total: z.coerce.number(),
  exempt: z.coerce.number().optional(),
  ivaBreakdown: z
    .array(
      z.object({
        id: z.coerce.number(),
        base: z.coerce.number(),
        amount: z.coerce.number(),
      })
    )
    .optional(),
});

const serviceDatesSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  due: z.string().min(1).optional(),
});

const bodySchema = z.object({
  saleId: z.string().min(1),
  type: z.enum(["A", "B"]),
  pointOfSale: z.coerce.number().int().positive().optional(),
  docType: z.union([z.string(), z.coerce.number()]).optional(),
  docNumber: z.string().optional(),
  currencyCode: z.string().optional(),
  issueDate: z.string().optional(),
  serviceDates: serviceDatesSchema.optional(),
  itemsTaxRates: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        rate: z.coerce.number(),
      })
    )
    .optional(),
  manualTotals: manualTotalsSchema.optional(),
  requiresIncomeTaxDeduction: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const invoices = await prisma.fiscalInvoice.findMany({
      where: { organizationId },
      include: {
        sale: { include: { customer: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      invoices.map((invoice) => ({
        id: invoice.id,
        saleId: invoice.saleId,
        type: invoice.type,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        cae: invoice.cae,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
        customerName: invoice.sale.customer.displayName,
        status: invoice.cae ? "APPROVED" : "PENDING",
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [
      "OWNER",
      "ADMIN",
      "SALES",
      "CASHIER",
    ]);
    const body = bodySchema.parse(await req.json());

    const issueDateResult = parseOptionalDate(body.issueDate);
    if (body.issueDate && issueDateResult.error) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }
    const issueDate = issueDateResult.date;

    let serviceDates = null;
    if (body.serviceDates) {
      const fromResult = parseOptionalDate(body.serviceDates.from);
      const toResult = parseOptionalDate(body.serviceDates.to);
      const dueResult = parseOptionalDate(body.serviceDates.due);
      const from = fromResult.date;
      const to = toResult.date;
      const due = dueResult.date;
      if (fromResult.error || toResult.error || !from || !to) {
        return NextResponse.json(
          { error: "Fechas de servicio invalidas" },
          { status: 400 }
        );
      }
      serviceDates = { from, to, due };
    }

    const requestPayload = {
      organizationId: membership.organizationId,
      saleId: body.saleId,
      type: body.type,
      pointOfSale: body.pointOfSale ?? null,
      docType: body.docType ?? null,
      docNumber: body.docNumber ?? null,
      currencyCode: body.currencyCode ?? null,
      issueDate,
      serviceDates,
      itemsTaxRates: body.itemsTaxRates,
      manualTotals: body.manualTotals ?? null,
      requiresIncomeTaxDeduction: body.requiresIncomeTaxDeduction ?? false,
    } as const;

    const job = await enqueueFiscalInvoiceIssueJob({
      organizationId: membership.organizationId,
      request: {
        saleId: requestPayload.saleId,
        type: requestPayload.type,
        pointOfSale: requestPayload.pointOfSale,
        docType: requestPayload.docType,
        docNumber: requestPayload.docNumber,
        currencyCode: requestPayload.currencyCode,
        issueDate: requestPayload.issueDate,
        serviceDates: requestPayload.serviceDates,
        itemsTaxRates: requestPayload.itemsTaxRates,
        manualTotals: requestPayload.manualTotals,
        requiresIncomeTaxDeduction:
          requestPayload.requiresIncomeTaxDeduction,
      },
    });

    await runFiscalIssueQueue(membership.organizationId);

    const resolvedJob = await getFiscalInvoiceIssueJob({
      organizationId: membership.organizationId,
      jobId: job.id,
    });
    if (!resolvedJob) {
      return NextResponse.json(
        { error: "No se pudo recuperar el estado de facturacion" },
        { status: 500 }
      );
    }

    if (resolvedJob.status === "ERROR") {
      return NextResponse.json(
        {
          code: resolvedJob.errorCode ?? "AFIP_ERROR",
          error: resolvedJob.errorMessage ?? "Error en ARCA.",
        },
        { status: 400 }
      );
    }

    if (resolvedJob.status === "COMPLETED" && resolvedJob.fiscalInvoice) {
      const invoice = resolvedJob.fiscalInvoice;
      const warnings = extractJobWarnings(resolvedJob.responsePayload);
      return NextResponse.json({
        id: invoice.id,
        saleId: invoice.saleId,
        type: invoice.type,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        cae: invoice.cae,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        warnings,
        jobId: resolvedJob.id,
        jobStatus: resolvedJob.status,
      });
    }

    return NextResponse.json({
      jobId: resolvedJob.id,
      saleId: resolvedJob.saleId,
      status: resolvedJob.status,
      message:
        resolvedJob.status === "RUNNING"
          ? "Factura en procesamiento"
          : "Factura en cola",
    }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const mapped = mapAfipError(error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
