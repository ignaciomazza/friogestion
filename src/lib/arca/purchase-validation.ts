import { z } from "zod";
import type { PurchaseValidationInput } from "@/lib/arca/wscdc";
import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_VOUCHER_KINDS,
  getPurchaseVoucherType,
} from "@/lib/purchases/fiscal";

export const PURCHASE_VOUCHER_KIND_OPTIONS = PURCHASE_VOUCHER_KINDS;

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
  documentType: z.enum(PURCHASE_DOCUMENT_TYPES).optional(),
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

const parseVoucherDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parseParts = (year: number, month: number, day: number) => {
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  };

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return parseParts(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const dashed = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    return parseParts(Number(dashed[1]), Number(dashed[2]), Number(dashed[3]));
  }

  const slashed = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashed) {
    return parseParts(Number(slashed[3]), Number(slashed[2]), Number(slashed[1]));
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }
  return new Date(
    fallback.getFullYear(),
    fallback.getMonth(),
    fallback.getDate(),
    12,
    0,
    0,
    0,
  );
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
      ? getPurchaseVoucherType(parsed.documentType ?? "INVOICE", parsed.voucherKind)
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
  const voucherDate = parseVoucherDate(input.voucherDate);
  if (!voucherDate) {
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
