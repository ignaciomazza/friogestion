import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { parseArcaPurchaseQr } from "@/lib/arca/purchase-qr";
import { logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

const bodySchema = z.object({
  qrText: z.string().min(1),
  supplierId: z.string().min(1).optional(),
});

const normalizeTaxId = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "");

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = bodySchema.parse(await req.json());
    const parsed = parseArcaPurchaseQr(body.qrText);

    let supplierWarning: string | null = null;
    if (body.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: body.supplierId,
          organizationId: membership.organizationId,
        },
        select: { taxId: true, displayName: true },
      });
      const supplierTaxId = normalizeTaxId(supplier?.taxId);
      if (supplierTaxId && supplierTaxId !== parsed.issuerTaxId) {
        supplierWarning = `El CUIT del QR (${parsed.issuerTaxId}) no coincide con el proveedor seleccionado (${supplierTaxId}).`;
      }
    }

    return NextResponse.json({
      ...parsed,
      warning: supplierWarning,
      arcaValidation: {
        mode: parsed.authorizationMode ?? "CAE",
        issuerTaxId: parsed.issuerTaxId,
        pointOfSale: parsed.pointOfSale,
        voucherType: parsed.voucherType,
        voucherKind: parsed.voucherKind ?? undefined,
        voucherNumber: parsed.voucherNumber,
        invoiceNumber: parsed.invoiceNumber,
        voucherDate: parsed.voucherDate,
        totalAmount: parsed.totalAmount,
        authorizationCode: parsed.authorizationCode ?? undefined,
        receiverDocType: parsed.receiverDocType ?? undefined,
        receiverDocNumber: parsed.receiverDocNumber ?? undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    if (
      error instanceof Error &&
      (error.message === "ARCA_QR_EMPTY" ||
        error.message === "ARCA_QR_INVALID" ||
        error.message.startsWith("ARCA_QR_"))
    ) {
      return NextResponse.json(
        { error: "El QR de ARCA no es valido o no se pudo leer" },
        { status: 400 },
      );
    }
    logServerError("api.purchases.qr.post", error);
    return NextResponse.json(
      { error: "No se pudo importar el QR" },
      { status: 400 },
    );
  }
}
