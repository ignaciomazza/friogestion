import { z } from "zod";
import type { PurchaseValidationInput } from "@/lib/arca/wscdc";

export const PURCHASE_VOUCHER_KIND_OPTIONS = ["A", "B", "C"] as const;

export const PURCHASE_VOUCHER_TYPE_BY_KIND: Record<
  (typeof PURCHASE_VOUCHER_KIND_OPTIONS)[number],
  number
> = {
  A: 1,
  B: 6,
  C: 11,
};

export const purchaseValidationSchema = z.object({
  mode: z.string().min(1).default("CAE"),
  issuerTaxId: z.string().min(1),
  pointOfSale: z.coerce.number().int().positive(),
  voucherType: z.coerce.number().int().positive(),
  voucherNumber: z.coerce.number().int().positive(),
  voucherDate: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  authorizationCode: z.string().min(1),
  receiverDocType: z.union([z.string(), z.coerce.number()]).optional(),
  receiverDocNumber: z.string().optional(),
});

export const purchaseValidationInputSchema = z.object({
  mode: z.string().min(1).optional(),
  issuerTaxId: z.string().optional(),
  pointOfSale: z.coerce.number().int().positive().optional(),
  voucherType: z.coerce.number().int().positive().optional(),
  voucherKind: z.enum(PURCHASE_VOUCHER_KIND_OPTIONS).optional(),
  voucherNumber: z
    .union([z.coerce.number().int().positive(), z.string().min(1)])
    .optional(),
  invoiceNumber: z.string().min(1).optional(),
  voucherDate: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  authorizationCode: z.string().min(1),
  receiverDocType: z.union([z.string(), z.coerce.number()]).optional(),
  receiverDocNumber: z.string().optional(),
});

export type PurchaseValidationPayload = z.infer<typeof purchaseValidationSchema>;
export type PurchaseValidationInputPayload = z.infer<
  typeof purchaseValidationInputSchema
>;

const digitsOnly = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "");

const parseInvoiceNumber = (value: string) => {
  const cleaned = value.trim();
  if (!cleaned) return null;

  const dashMatch = cleaned.match(/^(\d{1,5})-(\d{1,12})$/);
  if (dashMatch) {
    const pointOfSale = Number(dashMatch[1]);
    const voucherNumber = Number(dashMatch[2]);
    if (
      Number.isFinite(pointOfSale) &&
      pointOfSale > 0 &&
      Number.isFinite(voucherNumber) &&
      voucherNumber > 0
    ) {
      return { pointOfSale, voucherNumber };
    }
  }

  const digits = digitsOnly(cleaned);
  if (!digits) return null;
  if (digits.length > 8) {
    const pointOfSaleDigits = digits.slice(0, Math.max(digits.length - 8, 1));
    const voucherDigits = digits.slice(-8);
    const pointOfSale = Number(pointOfSaleDigits);
    const voucherNumber = Number(voucherDigits);
    if (
      Number.isFinite(pointOfSale) &&
      pointOfSale > 0 &&
      Number.isFinite(voucherNumber) &&
      voucherNumber > 0
    ) {
      return { pointOfSale, voucherNumber };
    }
  }

  const voucherNumber = Number(digits);
  if (Number.isFinite(voucherNumber) && voucherNumber > 0) {
    return { pointOfSale: 0, voucherNumber };
  }

  return null;
};

const parseVoucherNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const digits = digitsOnly(value);
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }
  return null;
};

export function buildPurchaseValidationPayload(
  input: unknown,
  defaults?: {
    issuerTaxId?: string | null;
    pointOfSale?: number | null;
    receiverDocType?: string | number | null;
    receiverDocNumber?: string | null;
  },
): PurchaseValidationPayload {
  const parsed = purchaseValidationInputSchema.parse(input);
  const parsedInvoice = parsed.invoiceNumber
    ? parseInvoiceNumber(parsed.invoiceNumber)
    : null;
  const voucherType =
    parsed.voucherType ??
    (parsed.voucherKind
      ? PURCHASE_VOUCHER_TYPE_BY_KIND[parsed.voucherKind]
      : undefined);
  const pointOfSale =
    parsed.pointOfSale ??
    (parsedInvoice?.pointOfSale && parsedInvoice.pointOfSale > 0
      ? parsedInvoice.pointOfSale
      : undefined) ??
    (defaults?.pointOfSale && defaults.pointOfSale > 0
      ? Math.trunc(defaults.pointOfSale)
      : undefined);
  const voucherNumber = parseVoucherNumber(
    parsed.voucherNumber ?? parsedInvoice?.voucherNumber,
  );
  const issuerTaxId = digitsOnly(parsed.issuerTaxId ?? defaults?.issuerTaxId);
  const receiverDocNumber = digitsOnly(
    parsed.receiverDocNumber ?? defaults?.receiverDocNumber,
  );

  if (!issuerTaxId) {
    throw new Error("PURCHASE_VALIDATION_ISSUER_TAX_ID_REQUIRED");
  }
  if (!voucherType) {
    throw new Error("PURCHASE_VALIDATION_VOUCHER_TYPE_REQUIRED");
  }
  if (!pointOfSale) {
    throw new Error("PURCHASE_VALIDATION_POINT_OF_SALE_REQUIRED");
  }
  if (!voucherNumber) {
    throw new Error("PURCHASE_VALIDATION_VOUCHER_NUMBER_REQUIRED");
  }

  return purchaseValidationSchema.parse({
    mode: parsed.mode ?? "CAE",
    issuerTaxId,
    pointOfSale,
    voucherType,
    voucherNumber,
    voucherDate: parsed.voucherDate,
    totalAmount: parsed.totalAmount,
    authorizationCode: parsed.authorizationCode,
    receiverDocType: parsed.receiverDocType ?? defaults?.receiverDocType ?? undefined,
    receiverDocNumber: receiverDocNumber || undefined,
  });
}

export function toWscdcValidationInput(
  input: PurchaseValidationPayload,
): PurchaseValidationInput {
  const voucherDate = new Date(input.voucherDate);
  if (Number.isNaN(voucherDate.getTime())) {
    throw new Error("PURCHASE_VALIDATION_DATE_INVALID");
  }

  let receiverDocType: number | null = null;
  if (input.receiverDocType !== undefined) {
    const parsed =
      typeof input.receiverDocType === "number"
        ? input.receiverDocType
        : Number(input.receiverDocType);
    if (Number.isFinite(parsed) && parsed > 0) {
      receiverDocType = parsed;
    }
  }

  return {
    mode: input.mode.trim().toUpperCase(),
    issuerTaxId: input.issuerTaxId,
    pointOfSale: input.pointOfSale,
    voucherType: input.voucherType,
    voucherNumber: input.voucherNumber,
    voucherDate,
    totalAmount: input.totalAmount,
    authorizationCode: input.authorizationCode.trim(),
    receiverDocType,
    receiverDocNumber: input.receiverDocNumber?.trim() || null,
  };
}
