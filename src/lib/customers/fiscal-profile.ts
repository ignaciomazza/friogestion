export const CUSTOMER_FISCAL_TAX_PROFILE_VALUES = [
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTISTA",
  "CONSUMIDOR_FINAL",
] as const;

export type CustomerFiscalTaxProfile =
  (typeof CUSTOMER_FISCAL_TAX_PROFILE_VALUES)[number];

export const CUSTOMER_FISCAL_TAX_PROFILE_LABELS: Record<
  CustomerFiscalTaxProfile,
  string
> = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTISTA: "Monotributista",
  CONSUMIDOR_FINAL: "Consumidor final",
};

export function normalizeCustomerFiscalTaxProfile(
  input?: string | null
): CustomerFiscalTaxProfile | null {
  if (!input) return null;
  const normalized = input.toUpperCase().trim();
  if (
    normalized === "RESPONSABLE_INSCRIPTO" ||
    normalized === "MONOTRIBUTISTA" ||
    normalized === "CONSUMIDOR_FINAL"
  ) {
    return normalized;
  }
  return null;
}

function normalizeArcaText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function inferFiscalTaxProfileFromArcaTaxStatus(
  taxStatus?: string | null
): CustomerFiscalTaxProfile | null {
  if (!taxStatus) return null;
  const normalized = normalizeArcaText(taxStatus);
  if (normalized.includes("RESPONSABLE INSCRIPTO")) {
    return "RESPONSABLE_INSCRIPTO";
  }
  if (normalized.includes("MONOTRIB")) {
    return "MONOTRIBUTISTA";
  }
  if (normalized.includes("CONSUMIDOR FINAL")) {
    return "CONSUMIDOR_FINAL";
  }
  return null;
}

export function resolveInvoiceTypeFromFiscalTaxProfile(
  profile?: string | null
): "A" | "B" {
  const normalized = normalizeCustomerFiscalTaxProfile(profile);
  if (normalized === "RESPONSABLE_INSCRIPTO") {
    return "A";
  }
  return "B";
}

export function resolveCondicionIvaReceptor(
  profile?: string | null,
  invoiceType?: "A" | "B"
) {
  const normalized = normalizeCustomerFiscalTaxProfile(profile);
  if (normalized === "RESPONSABLE_INSCRIPTO" || invoiceType === "A") {
    return 1;
  }
  if (normalized === "MONOTRIBUTISTA") {
    return 6;
  }
  return 5;
}
