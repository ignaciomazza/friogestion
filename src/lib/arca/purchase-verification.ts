import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  purchaseValidationSchema,
  toWscdcValidationInput,
  type PurchaseValidationPayload,
} from "@/lib/arca/purchase-validation";
import { validatePurchaseVoucherWithArca } from "@/lib/arca/wscdc";

type PurchaseValidationStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "OBSERVED"
  | "REJECTED"
  | "ERROR";

function toNullableJsonInput(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
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

  try {
    const validation = await validatePurchaseVoucherWithArca({
      organizationId: input.organizationId,
      data: requestPayload,
    });
    status = validation.status;
    message = validation.message;
    responsePayload = validation.raw;
  } catch (error) {
    status = "ERROR";
    message = error instanceof Error ? error.message : "ARCA_VALIDATION_ERROR";
    responsePayload = null;
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
