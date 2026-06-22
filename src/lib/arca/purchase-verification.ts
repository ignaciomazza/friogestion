import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  purchaseValidationSchema,
  toWscdcValidationInput,
  type PurchaseValidationPayload,
} from "@/lib/arca/purchase-validation";
import {
  validatePurchaseVoucherWithArca,
  type PurchaseValidationVoucherSnapshot,
} from "@/lib/arca/wscdc";
import {
  mapVoucherTypeToPurchaseDocumentType,
  mapVoucherTypeToPurchaseKind,
} from "@/lib/purchases/fiscal";

type PurchaseValidationStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "OBSERVED"
  | "REJECTED"
  | "ERROR";

const ARCA_HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "ARCA rechazo la consulta por datos invalidos del comprobante.",
  401: "ARCA rechazo la autenticacion. Revisa token y certificados.",
  403: "ARCA rechazo el acceso al servicio solicitado.",
  404: "ARCA no encontro el servicio solicitado.",
  408: "ARCA tardo demasiado en responder. Intenta nuevamente.",
  429: "ARCA recibio demasiadas consultas. Espera unos segundos y reintenta.",
  500: "ARCA devolvio un error interno.",
  502: "ARCA no respondio correctamente. Intenta nuevamente.",
  503: "ARCA no esta disponible temporalmente.",
  504: "ARCA no respondio a tiempo.",
};

function toNullableJsonInput(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
}

function normalizeValidationFailureMessage(error: unknown) {
  if (!(error instanceof Error)) return "No se pudo validar el comprobante en ARCA.";
  const message = error.message || "ARCA_VALIDATION_ERROR";

  const httpMatch = message.match(/^ARCA_HTTP_(\d{3})(?::\s*(.+))?$/i);
  if (httpMatch) {
    const statusCode = Number(httpMatch[1]);
    const detail = (httpMatch[2] ?? "").trim();
    const base =
      ARCA_HTTP_ERROR_MESSAGES[statusCode] ?? `ARCA devolvio HTTP ${statusCode}.`;
    return detail ? `${base} Detalle: ${detail}.` : base;
  }

  if (message === "ARCA_REQUEST_FAILED") {
    return "No se pudo comunicar con ARCA. Intenta nuevamente en unos segundos.";
  }
  if (message.startsWith("ARCA_RESPONSE_INVALID")) {
    return "ARCA respondio en un formato inesperado. Reintenta la validacion.";
  }
  if (message === "ARCA_VALIDATION_ERROR" || message === "ARCA_ERROR") {
    return "No se pudo validar el comprobante en ARCA.";
  }

  return message;
}

export async function validatePurchaseVoucher(input: {
  organizationId: string;
  actorUserId?: string | null;
  purchaseInvoiceId?: string | null;
  payload: unknown;
}) {
  const parsed = purchaseValidationSchema.parse(input.payload);
  const requestPayload = toWscdcValidationInput(parsed);
  const checkedAt = new Date();

  let status: PurchaseValidationStatus = "ERROR";
  let message = "No se pudo validar el comprobante en ARCA.";
  let responsePayload: unknown = null;
  let comprobante: PurchaseValidationVoucherSnapshot | null = null;

  try {
    const validation = await validatePurchaseVoucherWithArca({
      organizationId: input.organizationId,
      data: requestPayload,
    });
    status = validation.status;
    message = validation.message;
    responsePayload = validation.raw;
    comprobante = validation.comprobante;
  } catch (error) {
    status = "ERROR";
    message = normalizeValidationFailureMessage(error);
    responsePayload = null;
    comprobante = null;
  }

  await prisma.$transaction(async (tx) => {
    const requestPayloadJson = toNullableJsonInput(parsed);
    const responsePayloadJson = toNullableJsonInput(responsePayload);

    await tx.purchaseArcaValidation.create({
      data: {
        organizationId: input.organizationId,
        purchaseInvoiceId: input.purchaseInvoiceId ?? null,
        requestPayload: requestPayloadJson,
        responsePayload: responsePayloadJson,
        status,
        message,
        checkedAt,
        actorUserId: input.actorUserId ?? null,
      },
    });

    if (input.purchaseInvoiceId) {
      await tx.purchaseInvoice.update({
        where: { id: input.purchaseInvoiceId },
        data: {
          arcaValidationStatus: status,
          arcaValidationCheckedAt: checkedAt,
          arcaValidationMessage: message,
          arcaValidationRequest: requestPayloadJson,
          arcaValidationResponse: responsePayloadJson,
          documentType:
            mapVoucherTypeToPurchaseDocumentType(parsed.voucherType) ?? "INVOICE",
          fiscalVoucherKind: mapVoucherTypeToPurchaseKind(parsed.voucherType),
          fiscalVoucherType: parsed.voucherType,
          fiscalPointOfSale: parsed.pointOfSale,
          fiscalVoucherNumber: parsed.voucherNumber,
          authorizationMode: parsed.mode,
          authorizationCode: parsed.authorizationCode,
        },
      });
    }
  });

  return {
    status,
    message,
    checkedAt: checkedAt.toISOString(),
    request: parsed,
    response: responsePayload,
    comprobante,
  };
}

export async function revalidatePurchaseById(input: {
  organizationId: string;
  actorUserId?: string | null;
  purchaseInvoiceId: string;
}) {
  const purchase = await prisma.purchaseInvoice.findFirst({
    where: {
      id: input.purchaseInvoiceId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      arcaValidationRequest: true,
      supplier: {
        select: {
          taxId: true,
        },
      },
      invoiceDate: true,
      invoiceNumber: true,
      total: true,
    },
  });

  if (!purchase) {
    throw new Error("PURCHASE_NOT_FOUND");
  }

  if (!purchase.arcaValidationRequest || typeof purchase.arcaValidationRequest !== "object") {
    throw new Error("PURCHASE_VALIDATION_REQUEST_MISSING");
  }

  return validatePurchaseVoucher({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    purchaseInvoiceId: purchase.id,
    payload: purchase.arcaValidationRequest as PurchaseValidationPayload,
  });
}
