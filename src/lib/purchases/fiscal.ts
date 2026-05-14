import { z } from "zod";

export const PURCHASE_FISCAL_LINE_TYPES = [
  "IIBB_PERCEPTION",
  "VAT_PERCEPTION",
  "INCOME_TAX_PERCEPTION",
  "MUNICIPAL_PERCEPTION",
  "INTERNAL_TAX",
  "OTHER",
] as const;

export const PURCHASE_FISCAL_LINE_TYPE_LABELS: Record<
  (typeof PURCHASE_FISCAL_LINE_TYPES)[number],
  string
> = {
  IIBB_PERCEPTION: "Percepcion IIBB",
  VAT_PERCEPTION: "Percepcion IVA",
  INCOME_TAX_PERCEPTION: "Percepcion Ganancias",
  MUNICIPAL_PERCEPTION: "Percepcion municipal",
  INTERNAL_TAX: "Impuesto interno",
  OTHER: "Otro",
};

export const purchaseFiscalLineInputSchema = z.object({
  type: z.enum(PURCHASE_FISCAL_LINE_TYPES),
  jurisdiction: z.string().trim().max(80).optional().nullable(),
  baseAmount: z.coerce.number().min(0).optional().nullable(),
  rate: z.coerce.number().min(0).optional().nullable(),
  amount: z.coerce.number().positive(),
  note: z.string().trim().max(240).optional().nullable(),
});

export const purchaseFiscalInputSchema = z.object({
  netTaxed: z.coerce.number().min(0).optional(),
  netNonTaxed: z.coerce.number().min(0).optional(),
  exemptAmount: z.coerce.number().min(0).optional(),
  vatTotal: z.coerce.number().min(0).optional(),
  lines: z.array(purchaseFiscalLineInputSchema).optional(),
});

export type PurchaseFiscalLineInput = z.infer<
  typeof purchaseFiscalLineInputSchema
>;
export type PurchaseFiscalInput = z.infer<typeof purchaseFiscalInputSchema>;

export type NormalizedPurchaseFiscalLine = {
  type: (typeof PURCHASE_FISCAL_LINE_TYPES)[number];
  jurisdiction: string | null;
  baseAmount: number | null;
  rate: number | null;
  amount: number;
  note: string | null;
};

export type NormalizedPurchaseFiscalTotals = {
  currencyCode: string;
  netTaxed: number;
  netNonTaxed: number;
  exemptAmount: number;
  vatTotal: number;
  otherTaxesTotal: number;
  subtotal: number;
  taxes: number;
  total: number;
  lines: NormalizedPurchaseFiscalLine[];
};

export const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const cleanText = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
};

const normalizeCurrencyCode = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase();
  return normalized || "ARS";
};

const assertMoney = (value: number, code: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(code);
  }
};

export function sumFiscalLines(lines: Array<{ amount: number }>) {
  return round2(
    lines.reduce((sum, line) => {
      const amount = Number(line.amount ?? 0);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0),
  );
}

export function buildPurchaseFiscalTotals(input: {
  totalAmount: number;
  purchaseVatAmount?: number | null;
  fiscalDetail?: PurchaseFiscalInput | null;
  currencyCode?: string | null;
}): NormalizedPurchaseFiscalTotals {
  const total = round2(input.totalAmount);
  assertMoney(total, "PURCHASE_FISCAL_TOTAL_INVALID");

  const currencyCode = normalizeCurrencyCode(input.currencyCode);
  const parsedDetail = input.fiscalDetail
    ? purchaseFiscalInputSchema.parse(input.fiscalDetail)
    : null;

  if (!parsedDetail) {
    const vatTotal = round2(input.purchaseVatAmount ?? 0);
    assertMoney(vatTotal, "PURCHASE_FISCAL_VAT_INVALID");
    if (vatTotal - total > 0.01) {
      throw new Error("PURCHASE_FISCAL_VAT_EXCEEDS_TOTAL");
    }
    const netTaxed = round2(total - vatTotal);
    return {
      currencyCode,
      netTaxed,
      netNonTaxed: 0,
      exemptAmount: 0,
      vatTotal,
      otherTaxesTotal: 0,
      subtotal: netTaxed,
      taxes: vatTotal,
      total,
      lines: [],
    };
  }

  const lines = (parsedDetail.lines ?? []).map((line) => ({
    type: line.type,
    jurisdiction: cleanText(line.jurisdiction),
    baseAmount:
      line.baseAmount === null || line.baseAmount === undefined
        ? null
        : round2(line.baseAmount),
    rate:
      line.rate === null || line.rate === undefined
        ? null
        : round2(line.rate),
    amount: round2(line.amount),
    note: cleanText(line.note),
  }));

  const netTaxed = round2(parsedDetail.netTaxed ?? 0);
  const netNonTaxed = round2(parsedDetail.netNonTaxed ?? 0);
  const exemptAmount = round2(parsedDetail.exemptAmount ?? 0);
  const vatTotal = round2(parsedDetail.vatTotal ?? input.purchaseVatAmount ?? 0);
  const otherTaxesTotal = sumFiscalLines(lines);

  for (const [value, code] of [
    [netTaxed, "PURCHASE_FISCAL_NET_TAXED_INVALID"],
    [netNonTaxed, "PURCHASE_FISCAL_NET_NON_TAXED_INVALID"],
    [exemptAmount, "PURCHASE_FISCAL_EXEMPT_INVALID"],
    [vatTotal, "PURCHASE_FISCAL_VAT_INVALID"],
    [otherTaxesTotal, "PURCHASE_FISCAL_OTHER_TAXES_INVALID"],
  ] as const) {
    assertMoney(value, code);
  }

  const fiscalTotal = round2(
    netTaxed + netNonTaxed + exemptAmount + vatTotal + otherTaxesTotal,
  );
  if (Math.abs(fiscalTotal - total) > 0.01) {
    throw new Error("PURCHASE_FISCAL_TOTAL_MISMATCH");
  }

  const subtotal = round2(netTaxed + netNonTaxed + exemptAmount);
  return {
    currencyCode,
    netTaxed,
    netNonTaxed,
    exemptAmount,
    vatTotal,
    otherTaxesTotal,
    subtotal,
    taxes: vatTotal,
    total,
    lines,
  };
}

export function mapVoucherTypeToPurchaseKind(type: number | null | undefined) {
  if (type === 1) return "A";
  if (type === 6) return "B";
  if (type === 11) return "C";
  return null;
}

export function formatPurchaseInvoiceNumber(
  pointOfSale: number | null | undefined,
  voucherNumber: number | null | undefined,
) {
  if (!pointOfSale || !voucherNumber) return null;
  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}
