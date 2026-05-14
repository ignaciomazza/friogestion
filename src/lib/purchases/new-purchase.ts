export type PurchaseTotalsSource = "AUTO_FROM_PRODUCTS" | "MANUAL";

export type PurchaseArcaVoucherSnapshot = {
  mode?: string | null;
  issuerTaxId?: string | null;
  pointOfSale: number | null;
  voucherType: number | null;
  voucherNumber: number | null;
  voucherDate: string | null;
  totalAmount: number | null;
  authorizationCode: string | null;
};

export type PurchaseArcaFormValues = {
  voucherKind: "A" | "B" | "C";
  pointOfSale: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  authorizationCode: string;
};

export type PurchaseArcaMismatchField =
  | "invoice.voucherKind"
  | "invoice.pointOfSale"
  | "invoice.invoiceNumber"
  | "invoice.invoiceDate"
  | "invoice.authorizationCode"
  | "totals.totalAmount";

export type PurchaseArcaMismatch = {
  field: PurchaseArcaMismatchField;
  label: string;
  section: "invoice" | "totals";
  formValue: string;
  arcaValue: string;
};

export const ARGENTINA_JURISDICTIONS = [
  "CABA",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Cordoba",
  "Corrientes",
  "Entre Rios",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquen",
  "Rio Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucuman",
] as const;

const PURCHASE_VOUCHER_TYPE_BY_KIND: Record<"A" | "B" | "C", number> = {
  A: 1,
  B: 6,
  C: 11,
};

const JURISDICTION_ALIASES: Record<string, string> = {
  CABA: "CABA",
  "CIUDAD AUTONOMA DE BUENOS AIRES": "CABA",
  CORDOBA: "Cordoba",
  TUCUMAN: "Tucuman",
  "RIO NEGRO": "Rio Negro",
  "ENTRE RIOS": "Entre Rios",
  "SANTIAGO DEL ESTERO": "Santiago del Estero",
  "TIERRA DEL FUEGO": "Tierra del Fuego",
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

function parseInvoiceNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return { pointOfSale: null, voucherNumber: null };
  }

  const split = cleaned.match(/^(\d{1,5})-(\d{1,12})$/);
  if (split) {
    const pointOfSale = Number(split[1]);
    const voucherNumber = Number(split[2]);
    if (Number.isFinite(pointOfSale) && Number.isFinite(voucherNumber)) {
      return { pointOfSale, voucherNumber };
    }
  }

  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return { pointOfSale: null, voucherNumber: null };

  if (digits.length > 8) {
    const pointOfSaleDigits = digits.slice(0, Math.max(digits.length - 8, 1));
    const voucherDigits = digits.slice(-8);
    return {
      pointOfSale: Number(pointOfSaleDigits) || null,
      voucherNumber: Number(voucherDigits) || null,
    };
  }

  return { pointOfSale: null, voucherNumber: Number(digits) || null };
}

export function normalizeJurisdiction(value: string) {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";
  const alias = JURISDICTION_ALIASES[cleaned.toUpperCase()];
  if (alias) return alias;
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((chunk) =>
      chunk ? `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}` : chunk,
    )
    .join(" ");
}

export function suggestJurisdictions(query: string, limit = 8) {
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) {
    return [...ARGENTINA_JURISDICTIONS].slice(0, limit);
  }
  return ARGENTINA_JURISDICTIONS.filter((item) =>
    normalizeText(item).toLowerCase().includes(normalizedQuery),
  ).slice(0, limit);
}

export function calculateFiscalLineAmount(
  baseAmount: number | null,
  rate: number | null,
) {
  if (baseAmount === null || rate === null) return null;
  if (!Number.isFinite(baseAmount) || !Number.isFinite(rate)) return null;
  if (baseAmount < 0 || rate < 0) return null;
  return normalizeMoney((baseAmount * rate) / 100);
}

export function calculateAutoTotalsFromProducts(input: {
  subtotal: number;
  vat: number;
  fiscalOtherTotal: number;
}) {
  const subtotal = Math.max(0, normalizeMoney(input.subtotal));
  const vat = Math.max(0, normalizeMoney(input.vat));
  const fiscalOtherTotal = Math.max(0, normalizeMoney(input.fiscalOtherTotal));
  return {
    netTaxed: subtotal,
    vat,
    total: normalizeMoney(subtotal + vat + fiscalOtherTotal),
  };
}

export function compareArcaVoucherAgainstForm(input: {
  form: PurchaseArcaFormValues;
  arca: PurchaseArcaVoucherSnapshot | null;
}) {
  const { form, arca } = input;
  if (!arca) return [] as PurchaseArcaMismatch[];

  const expectedVoucherType = PURCHASE_VOUCHER_TYPE_BY_KIND[form.voucherKind];
  const parsedInvoice = parseInvoiceNumber(form.invoiceNumber);
  const pointOfSaleDigits = form.pointOfSale.replace(/\D/g, "");
  const expectedPointOfSale =
    pointOfSaleDigits.length > 0
      ? Number(pointOfSaleDigits)
      : parsedInvoice.pointOfSale;
  const expectedVoucherNumber = parsedInvoice.voucherNumber;
  const expectedDate = form.invoiceDate.trim();
  const expectedTotal = normalizeMoney(form.totalAmount);
  const expectedAuthorization = normalizeCode(form.authorizationCode);

  const mismatches: PurchaseArcaMismatch[] = [];

  if (arca.voucherType !== null && arca.voucherType !== expectedVoucherType) {
    mismatches.push({
      field: "invoice.voucherKind",
      label: "tipo de comprobante",
      section: "invoice",
      formValue: form.voucherKind,
      arcaValue: String(arca.voucherType),
    });
  }

  if (
    arca.pointOfSale !== null &&
    expectedPointOfSale !== null &&
    arca.pointOfSale !== expectedPointOfSale
  ) {
    mismatches.push({
      field: "invoice.pointOfSale",
      label: "punto de venta",
      section: "invoice",
      formValue: String(expectedPointOfSale),
      arcaValue: String(arca.pointOfSale),
    });
  }

  if (
    arca.voucherNumber !== null &&
    expectedVoucherNumber !== null &&
    arca.voucherNumber !== expectedVoucherNumber
  ) {
    mismatches.push({
      field: "invoice.invoiceNumber",
      label: "numero de comprobante",
      section: "invoice",
      formValue: String(expectedVoucherNumber),
      arcaValue: String(arca.voucherNumber),
    });
  }

  if (arca.voucherDate && expectedDate && arca.voucherDate !== expectedDate) {
    mismatches.push({
      field: "invoice.invoiceDate",
      label: "fecha de comprobante",
      section: "invoice",
      formValue: expectedDate,
      arcaValue: arca.voucherDate,
    });
  }

  if (
    arca.totalAmount !== null &&
    Math.abs(normalizeMoney(arca.totalAmount) - expectedTotal) > 0.01
  ) {
    mismatches.push({
      field: "totals.totalAmount",
      label: "importe total",
      section: "totals",
      formValue: expectedTotal.toFixed(2),
      arcaValue: normalizeMoney(arca.totalAmount).toFixed(2),
    });
  }

  if (
    arca.authorizationCode &&
    expectedAuthorization &&
    normalizeCode(arca.authorizationCode) !== expectedAuthorization
  ) {
    mismatches.push({
      field: "invoice.authorizationCode",
      label: "CAE",
      section: "invoice",
      formValue: expectedAuthorization,
      arcaValue: normalizeCode(arca.authorizationCode),
    });
  }

  return mismatches;
}

export function summarizeArcaMismatches(mismatches: PurchaseArcaMismatch[]) {
  const labels = Array.from(new Set(mismatches.map((item) => item.label)));
  if (!labels.length) return "";
  return `ARCA no coincide con la carga en ${labels.join(", ")}.`;
}
