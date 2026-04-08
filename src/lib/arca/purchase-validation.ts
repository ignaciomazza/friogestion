import { z } from "zod";
import type { PurchaseValidationInput } from "@/lib/arca/wscdc";

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

export type PurchaseValidationPayload = z.infer<typeof purchaseValidationSchema>;

export function toWscdcValidationInput(
  input: PurchaseValidationPayload
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
