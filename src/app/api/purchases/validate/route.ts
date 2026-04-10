import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { prisma } from "@/lib/prisma";
import {
  buildPurchaseValidationPayload,
  purchaseValidationInputSchema,
} from "@/lib/arca/purchase-validation";
import { validatePurchaseVoucher } from "@/lib/arca/purchase-verification";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";

export const runtime = "nodejs";

const bodySchema = purchaseValidationInputSchema.extend({
  purchaseInvoiceId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = bodySchema.parse(await req.json());

    let supplierTaxId: string | null = null;
    if (body.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: body.supplierId,
          organizationId: membership.organizationId,
        },
        select: { taxId: true },
      });
      supplierTaxId = supplier?.taxId ?? null;
    } else if (body.purchaseInvoiceId) {
      const purchase = await prisma.purchaseInvoice.findFirst({
        where: {
          id: body.purchaseInvoiceId,
          organizationId: membership.organizationId,
        },
        select: {
          supplier: {
            select: { taxId: true },
          },
        },
      });
      supplierTaxId = purchase?.supplier.taxId ?? null;
    }

    const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: membership.organizationId },
      select: { taxIdRepresentado: true, defaultPointOfSale: true },
    });

    const normalizedPayload = buildPurchaseValidationPayload(body, {
      issuerTaxId: supplierTaxId,
      pointOfSale: fiscalConfig?.defaultPointOfSale ?? null,
      receiverDocType: fiscalConfig?.taxIdRepresentado ? "80" : null,
      receiverDocNumber: fiscalConfig?.taxIdRepresentado ?? null,
    });

    const result = await validatePurchaseVoucher({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      purchaseInvoiceId: body.purchaseInvoiceId ?? null,
      payload: normalizedPayload,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    const mapped = mapArcaValidationError(error);
    logServerError("api.purchases.validate.post", error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
