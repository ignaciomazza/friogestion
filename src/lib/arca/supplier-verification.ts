import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  compareNamesForMatch,
  normalizeCuit,
} from "@/lib/arca/normalization";
import { lookupTaxpayerByCuit } from "@/lib/arca/taxpayer-lookup";

type SupplierVerificationStatus =
  | "PENDING"
  | "MATCH"
  | "PARTIAL"
  | "MISMATCH"
  | "NO_ENCONTRADO"
  | "ERROR";

type SupplierSnapshot = {
  id: string;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
};

function toNullableJsonInput(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value == null) {
    return Prisma.DbNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapNameMatchToStatus(level: "MATCH" | "PARTIAL" | "MISMATCH") {
  if (level === "MATCH") return "MATCH" as SupplierVerificationStatus;
  if (level === "PARTIAL") return "PARTIAL" as SupplierVerificationStatus;
  return "MISMATCH" as SupplierVerificationStatus;
}

export async function verifySupplierWithArca(input: {
  organizationId: string;
  actorUserId?: string | null;
  supplierId?: string | null;
  taxId?: string | null;
  legalName?: string | null;
  displayName?: string | null;
}) {
  let supplier: SupplierSnapshot | null = null;
  if (input.supplierId) {
    supplier = await prisma.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        legalName: true,
        taxId: true,
      },
    });
    if (!supplier) {
      throw new Error("SUPPLIER_NOT_FOUND");
    }
  }

  const normalizedTaxId = normalizeCuit(
    input.taxId ?? supplier?.taxId ?? null
  );
  if (!normalizedTaxId) {
    throw new Error("CUIT_INVALID");
  }

  const lookup = await lookupTaxpayerByCuit({
    organizationId: input.organizationId,
    taxId: normalizedTaxId,
  });

  let status: SupplierVerificationStatus = "NO_ENCONTRADO";
  let message = "No se encontro contribuyente para el CUIT informado.";
  let diff: {
    level: "MATCH" | "PARTIAL" | "MISMATCH";
    score: number;
    normalizedInput: string;
    normalizedArca: string;
  } | null = null;

  if (lookup.taxpayer.status === "FOUND") {
    const inputName =
      input.legalName ??
      supplier?.legalName ??
      input.displayName ??
      supplier?.displayName ??
      null;
    diff = compareNamesForMatch(inputName, lookup.taxpayer.legalName ?? lookup.taxpayer.displayName);
    status = mapNameMatchToStatus(diff.level);
    message =
      diff.level === "MATCH"
        ? "Razon social verificada correctamente."
        : diff.level === "PARTIAL"
          ? "Razon social con coincidencia parcial."
          : "Razon social no coincide con ARCA.";
  }

  const checkedAt = new Date();
  const requestPayload = {
    supplierId: supplier?.id ?? null,
    taxId: normalizedTaxId,
    legalName:
      input.legalName ??
      supplier?.legalName ??
      input.displayName ??
      supplier?.displayName ??
      null,
  };
  const responsePayload = {
    lookup,
    diff,
  };
  const requestPayloadJson = toNullableJsonInput(requestPayload);
  const responsePayloadJson = toNullableJsonInput(responsePayload);

  await prisma.$transaction(async (tx) => {
    await tx.supplierArcaVerification.create({
      data: {
        organizationId: input.organizationId,
        supplierId: supplier?.id ?? null,
        taxId: normalizedTaxId,
        requestPayload: requestPayloadJson,
        responsePayload: responsePayloadJson,
        status,
        message,
        checkedAt,
        actorUserId: input.actorUserId ?? null,
      },
    });

    if (supplier?.id) {
      await tx.supplier.update({
        where: { id: supplier.id },
        data: {
          taxId: normalizedTaxId,
          arcaVerificationStatus: status,
          arcaVerificationCheckedAt: checkedAt,
          arcaVerificationMessage: message,
          arcaVerificationSnapshot: responsePayloadJson,
        },
      });
    }
  });

  return {
    status,
    message,
    checkedAt: checkedAt.toISOString(),
    supplierId: supplier?.id ?? null,
    taxId: normalizedTaxId,
    diff,
    snapshot: lookup.taxpayer,
    source: lookup.source,
  };
}
