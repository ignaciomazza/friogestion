import { z } from "zod";
import {
  formatPurchaseInvoiceNumber,
  mapVoucherTypeToPurchaseKind,
} from "@/lib/purchases/fiscal";

const arcaQrPayloadSchema = z.object({
  ver: z.union([z.string(), z.number()]).optional(),
  fecha: z.string().min(1),
  cuit: z.union([z.string(), z.number()]),
  ptoVta: z.coerce.number().int().positive(),
  tipoCmp: z.coerce.number().int().positive(),
  nroCmp: z.coerce.number().int().positive(),
  importe: z.coerce.number().positive(),
  moneda: z.string().min(1).optional(),
  ctz: z.coerce.number().positive().optional(),
  tipoDocRec: z.union([z.string(), z.number()]).optional(),
  nroDocRec: z.union([z.string(), z.number()]).optional(),
  tipoCodAut: z.union([z.string(), z.number()]).optional(),
  codAut: z.union([z.string(), z.number()]).optional(),
});

export type ParsedArcaPurchaseQr = {
  issuerTaxId: string;
  pointOfSale: number;
  voucherType: number;
  voucherKind: "A" | "B" | "C" | null;
  voucherNumber: number;
  invoiceNumber: string;
  voucherDate: string;
  totalAmount: number;
  currencyCode: string;
  authorizationMode: string | null;
  authorizationCode: string | null;
  receiverDocType: string | null;
  receiverDocNumber: string | null;
  raw: Record<string, unknown>;
};

const digitsOnly = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/\D/g, "");

const normalizeAuthorizationMode = (
  value: string | number | null | undefined,
) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "E" || normalized === "CAE") return "CAE";
  if (normalized === "A" || normalized === "CAEA") return "CAEA";
  return normalized;
};

const normalizeBase64 = (value: string) => {
  const withoutWhitespace = value.trim().replace(/\s/g, "");
  const base64 = withoutWhitespace.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  return padding ? `${base64}${"=".repeat(4 - padding)}` : base64;
};

const decodeBase64Json = (value: string) => {
  const decoded = Buffer.from(normalizeBase64(value), "base64").toString("utf8");
  return JSON.parse(decoded) as unknown;
};

const extractQrPayloadText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("ARCA_QR_EMPTY");
  }

  if (trimmed.startsWith("{")) return trimmed;

  try {
    const url = new URL(trimmed);
    const payload = url.searchParams.get("p");
    if (payload) return payload;
  } catch {
    const match = /[?&]p=([^&\s]+)/.exec(trimmed);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return trimmed;
};

export function parseArcaPurchaseQr(value: string): ParsedArcaPurchaseQr {
  const payloadText = extractQrPayloadText(value);
  let raw: unknown;
  try {
    raw = payloadText.trim().startsWith("{")
      ? JSON.parse(payloadText)
      : decodeBase64Json(payloadText);
  } catch {
    throw new Error("ARCA_QR_INVALID");
  }

  const payload = arcaQrPayloadSchema.parse(raw);
  const issuerTaxId = digitsOnly(payload.cuit);
  if (!issuerTaxId) {
    throw new Error("ARCA_QR_ISSUER_TAX_ID_MISSING");
  }

  const voucherKind = mapVoucherTypeToPurchaseKind(payload.tipoCmp);
  const invoiceNumber =
    formatPurchaseInvoiceNumber(payload.ptoVta, payload.nroCmp) ??
    String(payload.nroCmp);
  const authorizationCode = digitsOnly(payload.codAut) || null;

  return {
    issuerTaxId,
    pointOfSale: payload.ptoVta,
    voucherType: payload.tipoCmp,
    voucherKind,
    voucherNumber: payload.nroCmp,
    invoiceNumber,
    voucherDate: payload.fecha,
    totalAmount: payload.importe,
    currencyCode: payload.moneda?.trim().toUpperCase() || "ARS",
    authorizationMode: normalizeAuthorizationMode(payload.tipoCodAut),
    authorizationCode,
    receiverDocType:
      payload.tipoDocRec === undefined ? null : String(payload.tipoDocRec),
    receiverDocNumber: digitsOnly(payload.nroDocRec) || null,
    raw: raw as Record<string, unknown>,
  };
}
