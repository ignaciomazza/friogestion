import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { issueDebitNote } from "@/lib/afip/fiscal";
import { mapAfipError } from "@/lib/afip/errors";
import { isAuthError } from "@/lib/auth/errors";
import { parseOptionalDate } from "@/lib/validation";

export const runtime = "nodejs";

const serviceDatesSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  due: z.string().min(1).optional(),
});

const bodySchema = z.object({
  fiscalCreditNoteId: z.string().min(1),
  pointOfSale: z.coerce.number().int().positive().optional(),
  issueDate: z.string().optional(),
  serviceDates: serviceDatesSchema.optional(),
});

function getDebitNoteDelegate() {
  return (
    prisma as unknown as {
      fiscalDebitNote?: {
        findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
      };
    }
  ).fiscalDebitNote;
}

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const debitNoteDelegate = getDebitNoteDelegate();
    if (!debitNoteDelegate) {
      return NextResponse.json(
        { error: "Modelo FiscalDebitNote no disponible. Ejecuta migraciones y prisma generate." },
        { status: 503 },
      );
    }
    const notes = await debitNoteDelegate.findMany({
      where: { organizationId },
      include: {
        fiscalCreditNote: true,
        fiscalInvoice: true,
        sale: { include: { customer: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      notes.map((rawNote) => {
        const note = rawNote as {
          id: string;
          fiscalCreditNoteId: string | null;
          fiscalInvoiceId: string | null;
          saleId: string | null;
          debitNumber: string | null;
          pointOfSale: string | null;
          type: string | null;
          cae: string | null;
          issuedAt: Date | null;
          createdAt: Date;
          sale?: { customer?: { displayName?: string | null } | null } | null;
        };
        return {
          id: note.id,
          fiscalCreditNoteId: note.fiscalCreditNoteId,
          fiscalInvoiceId: note.fiscalInvoiceId,
          saleId: note.saleId,
          number: note.debitNumber,
          pointOfSale: note.pointOfSale,
          type: note.type,
          cae: note.cae,
          issuedAt: note.issuedAt?.toISOString() ?? null,
          createdAt: note.createdAt.toISOString(),
          customerName: note.sale?.customer?.displayName ?? null,
        };
      }),
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!getDebitNoteDelegate()) {
      return NextResponse.json(
        { error: "Modelo FiscalDebitNote no disponible. Ejecuta migraciones y prisma generate." },
        { status: 503 },
      );
    }
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
          { status: 400 },
        );
      }
      serviceDates = { from, to, due };
    }

    const note = await issueDebitNote({
      organizationId: membership.organizationId,
      fiscalCreditNoteId: body.fiscalCreditNoteId,
      pointOfSale: body.pointOfSale ?? null,
      issueDate,
      serviceDates,
    });

    return NextResponse.json({
      id: note.id,
      fiscalCreditNoteId: note.fiscalCreditNoteId,
      fiscalInvoiceId: note.fiscalInvoiceId,
      number: note.debitNumber,
      pointOfSale: note.pointOfSale,
      type: note.type,
      cae: note.cae,
      issuedAt: note.issuedAt?.toISOString() ?? null,
      createdAt: note.createdAt.toISOString(),
    });
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
