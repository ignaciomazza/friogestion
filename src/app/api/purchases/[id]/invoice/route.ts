import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recalcPurchaseTotals } from "@/lib/purchases";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import {
  buildPurchaseValidationPayload,
  type PurchaseValidationPayload,
} from "@/lib/arca/purchase-validation";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";
import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_VOUCHER_KINDS,
  assertPurchaseVoucherVatRules,
  getPurchaseFiscalRecordType,
  getPurchaseVoucherType,
  mapVoucherTypeToPurchaseDocumentType,
  mapVoucherTypeToPurchaseKind,
} from "@/lib/purchases/fiscal";
import type {
  PurchaseDocumentType,
  PurchaseVoucherKind,
} from "@/lib/purchases/fiscal";

export const runtime = "nodejs";

const updatePurchaseInvoiceSchema = z.object({
  hasInvoice: z.boolean().optional(),
  documentType: z.enum(PURCHASE_DOCUMENT_TYPES).optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  voucherKind: z.enum(PURCHASE_VOUCHER_KINDS).optional().nullable(),
  authorizationCode: z.string().optional().nullable(),
});

const trimToNull = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  return normalized || null;
};

const parseInvoiceNumber = (value: string) => {
  const match = value.trim().match(/^(\d{1,5})-(\d{1,12})$/);
  if (!match) return null;
  const pointOfSale = Number(match[1]);
  const voucherNumber = Number(match[2]);
  if (
    !Number.isFinite(pointOfSale) ||
    pointOfSale <= 0 ||
    !Number.isFinite(voucherNumber) ||
    voucherNumber <= 0
  ) {
    return null;
  }
  return {
    pointOfSale: Math.trunc(pointOfSale),
    voucherNumber: Math.trunc(voucherNumber),
  };
};

const toNullableJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;
    const body = updatePurchaseInvoiceSchema.parse(await req.json());

    const purchase = await prisma.purchaseInvoice.findFirst({
      where: {
        id: params.id,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        status: true,
        documentType: true,
        invoiceNumber: true,
        invoiceDate: true,
        total: true,
        vatTotal: true,
        fiscalVoucherKind: true,
        fiscalVoucherType: true,
        authorizationMode: true,
        authorizationCode: true,
        currentAccountEntries: {
          where: { sourceType: "PURCHASE" },
          select: { id: true },
          take: 1,
        },
        supplier: {
          select: {
            taxId: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (purchase.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede editar una compra cancelada" },
        { status: 409 },
      );
    }

    const hasInvoice =
      body.hasInvoice ??
      Boolean(trimToNull(body.invoiceNumber) ?? trimToNull(purchase.invoiceNumber));
    const fiscalComputable = hasInvoice;

    const invoiceNumber = hasInvoice
      ? trimToNull(body.invoiceNumber) ?? trimToNull(purchase.invoiceNumber)
      : null;

    if (hasInvoice && !invoiceNumber) {
      return NextResponse.json(
        { error: "Ingresa numero de comprobante" },
        { status: 400 },
      );
    }

    const parsedInvoiceNumber = invoiceNumber ? parseInvoiceNumber(invoiceNumber) : null;
    if (hasInvoice && !parsedInvoiceNumber) {
      return NextResponse.json(
        {
          error:
            "El numero de comprobante debe tener formato 0001-00001234 (con guion).",
        },
        { status: 400 },
      );
    }

    const invoiceDateInput = hasInvoice
      ? trimToNull(body.invoiceDate) ??
        (purchase.invoiceDate ? purchase.invoiceDate.toISOString().slice(0, 10) : null)
      : null;

    if (hasInvoice && !invoiceDateInput) {
      return NextResponse.json(
        { error: "Ingresa fecha del comprobante" },
        { status: 400 },
      );
    }

    const parsedDate = parseOptionalDate(invoiceDateInput ?? undefined);
    if (parsedDate.error) {
      return NextResponse.json(
        { error: "Fecha del comprobante invalida" },
        { status: 400 },
      );
    }

    const invoiceDate = hasInvoice ? parsedDate.date : null;
    const documentType: PurchaseDocumentType | null = hasInvoice
      ? body.documentType ??
        mapVoucherTypeToPurchaseDocumentType(purchase.fiscalVoucherType) ??
        purchase.documentType ??
        "INVOICE"
      : null;
    const voucherKind: PurchaseVoucherKind | null = hasInvoice
      ? body.voucherKind ??
        (mapVoucherTypeToPurchaseKind(purchase.fiscalVoucherType) as PurchaseVoucherKind | null) ??
        (purchase.fiscalVoucherKind === "A" ||
        purchase.fiscalVoucherKind === "B" ||
        purchase.fiscalVoucherKind === "C"
          ? (purchase.fiscalVoucherKind as PurchaseVoucherKind)
          : null)
      : null;

    if (hasInvoice) {
      try {
        assertPurchaseVoucherVatRules({
          voucherKind,
          vatTotal: Number(purchase.vatTotal ?? 0),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PURCHASE_FISCAL_VAT_NOT_ALLOWED_FOR_VOUCHER_C"
        ) {
          return NextResponse.json(
            { error: "Factura C: no genera credito fiscal de IVA" },
            { status: 400 },
          );
        }
        throw error;
      }
    }
    const authorizationCode = hasInvoice
      ? trimToNull(body.authorizationCode) ?? trimToNull(purchase.authorizationCode)
      : null;

    const totalAmount = Number(purchase.total ?? 0);
    const hasTotalAmount = Number.isFinite(totalAmount) && totalAmount > 0;
    const supplierTaxId = trimToNull(purchase.supplier.taxId);

    let arcaValidationPayload: PurchaseValidationPayload | null = null;
    if (
      hasInvoice &&
      invoiceNumber &&
      invoiceDateInput &&
      voucherKind &&
      authorizationCode &&
      hasTotalAmount &&
      supplierTaxId
    ) {
      const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
        where: { organizationId: membership.organizationId },
        select: {
          defaultPointOfSale: true,
          taxIdRepresentado: true,
        },
      });

      arcaValidationPayload = buildPurchaseValidationPayload(
        {
          voucherKind,
          documentType,
          invoiceNumber,
          voucherDate: invoiceDateInput,
          totalAmount,
          authorizationCode,
        },
        {
          issuerTaxId: supplierTaxId,
          pointOfSale: fiscalConfig?.defaultPointOfSale ?? null,
          receiverDocType: fiscalConfig?.taxIdRepresentado ? "80" : null,
          receiverDocNumber: fiscalConfig?.taxIdRepresentado ?? null,
        },
      );
    }

    const updated = await prisma.purchaseInvoice.update({
      where: { id: purchase.id },
      data: {
        documentType: documentType ?? "INVOICE",
        invoiceNumber,
        invoiceDate,
        fiscalVoucherKind: hasInvoice
          ? arcaValidationPayload
            ? mapVoucherTypeToPurchaseKind(arcaValidationPayload.voucherType)
            : voucherKind
          : null,
        fiscalVoucherType: hasInvoice
          ? arcaValidationPayload?.voucherType ??
            getPurchaseVoucherType(documentType, voucherKind)
          : null,
        fiscalPointOfSale: hasInvoice
          ? arcaValidationPayload?.pointOfSale ?? parsedInvoiceNumber?.pointOfSale ?? null
          : null,
        fiscalVoucherNumber: hasInvoice
          ? arcaValidationPayload?.voucherNumber ??
            parsedInvoiceNumber?.voucherNumber ??
            null
          : null,
        authorizationMode: hasInvoice
          ? arcaValidationPayload?.mode ??
            (authorizationCode ? "CAE" : purchase.authorizationMode)
          : null,
        authorizationCode,
        arcaValidationRequest: arcaValidationPayload
          ? toNullableJsonInput(arcaValidationPayload)
          : Prisma.DbNull,
        arcaValidationResponse: Prisma.DbNull,
        arcaValidationStatus: "PENDING",
        arcaValidationCheckedAt: null,
        arcaValidationMessage: hasInvoice
          ? arcaValidationPayload
            ? "Datos del comprobante actualizados. Revalida para confirmar en ARCA."
            : "Comprobante actualizado. Completa CAE y revalida en ARCA."
          : "Registro interno no computable fiscalmente. Sin comprobante fiscal.",
      },
      select: {
        id: true,
        documentType: true,
        invoiceNumber: true,
        invoiceDate: true,
        fiscalVoucherKind: true,
        fiscalVoucherType: true,
        fiscalPointOfSale: true,
        fiscalVoucherNumber: true,
        authorizationCode: true,
      },
    });

    if (purchase.currentAccountEntries.length > 0) {
      const isCreditNote = documentType === "CREDIT_NOTE";
      await prisma.$transaction(async (tx) => {
        await tx.currentAccountEntry.updateMany({
          where: {
            organizationId: membership.organizationId,
            purchaseInvoiceId: purchase.id,
            sourceType: "PURCHASE",
          },
          data: {
            direction: isCreditNote ? "DEBIT" : "CREDIT",
            note: `${
              documentType === "CREDIT_NOTE"
                ? "Nota de credito"
                : documentType === "DEBIT_NOTE"
                  ? "Nota de debito"
                  : "Factura"
            } ${updated.invoiceNumber ?? purchase.id}`,
          },
        });
        if (isCreditNote) {
          await tx.purchaseInvoice.update({
            where: { id: purchase.id },
            data: {
              paidTotal: totalAmount.toFixed(2),
              balance: "0.00",
              paymentStatus: "PAID",
            },
          });
        } else {
          await recalcPurchaseTotals(tx, purchase.id);
        }
      });
    }

    return NextResponse.json({
      message: hasInvoice
        ? arcaValidationPayload
          ? "Comprobante actualizado. Revalida para confirmar en ARCA."
          : "Comprobante actualizado. Falta completar datos para revalidar en ARCA."
        : "Compra actualizada. Sin comprobante fiscal (registro interno no computable fiscalmente).",
      purchase: {
        id: updated.id,
        documentType: updated.documentType,
        invoiceNumber: updated.invoiceNumber,
        invoiceDate: updated.invoiceDate?.toISOString().slice(0, 10) ?? null,
        fiscalVoucherKind: updated.fiscalVoucherKind,
        fiscalVoucherType: updated.fiscalVoucherType,
        fiscalPointOfSale: updated.fiscalPointOfSale,
        fiscalVoucherNumber: updated.fiscalVoucherNumber,
        authorizationCode: updated.authorizationCode,
        fiscalComputable,
        fiscalRecordType: getPurchaseFiscalRecordType(fiscalComputable),
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
    const mapped = mapArcaValidationError(error);
    logServerError("api.purchases.id.invoice.patch", error);
    return NextResponse.json({ error: mapped.error }, { status: 400 });
  }
}
