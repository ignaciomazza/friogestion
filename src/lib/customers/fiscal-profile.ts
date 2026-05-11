export const CUSTOMER_FISCAL_TAX_PROFILE_VALUES = [
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTISTA",
  "MONOTRIBUTO_SOCIAL",
  "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO",
  "CONSUMIDOR_FINAL",
  "IVA_SUJETO_EXENTO",
  "IVA_NO_ALCANZADO",
  "SUJETO_NO_CATEGORIZADO",
  "IVA_LIBERADO",
] as const;

export type CustomerFiscalTaxProfile =
  (typeof CUSTOMER_FISCAL_TAX_PROFILE_VALUES)[number];

export const CUSTOMER_FISCAL_TAX_PROFILE_LABELS: Record<
  CustomerFiscalTaxProfile,
  string
> = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTISTA: "Monotributista",
  MONOTRIBUTO_SOCIAL: "Monotributo social",
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO:
    "Monotributo trabajador promovido",
  CONSUMIDOR_FINAL: "Consumidor final",
  IVA_SUJETO_EXENTO: "IVA sujeto exento",
  IVA_NO_ALCANZADO: "IVA no alcanzado",
  SUJETO_NO_CATEGORIZADO: "Sujeto no categorizado",
  IVA_LIBERADO: "IVA liberado Ley 19.640",
};

export function normalizeCustomerFiscalTaxProfile(
  input?: string | null
): CustomerFiscalTaxProfile | null {
  if (!input) return null;
  const normalized = input.toUpperCase().trim();
  if (CUSTOMER_FISCAL_TAX_PROFILE_VALUES.includes(
    normalized as CustomerFiscalTaxProfile
  )) {
    return normalized as CustomerFiscalTaxProfile;
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
  const normalizedWords = normalized.replace(/[^A-Z0-9]+/g, " ").trim();
  if (normalized.includes("CONSUMIDOR FINAL")) {
    return "CONSUMIDOR_FINAL";
  }
  if (
    normalizedWords.includes("MONOTRIBUTO SOCIAL") ||
    normalizedWords.includes("MONOTRIBUTISTA SOCIAL")
  ) {
    return "MONOTRIBUTO_SOCIAL";
  }
  if (
    normalizedWords.includes("TRABAJADOR INDEPENDIENTE PROMOVIDO") ||
    normalizedWords.includes("TRABAJADOR PROMOVIDO")
  ) {
    return "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO";
  }
  if (normalized.includes("MONOTRIB")) {
    return "MONOTRIBUTISTA";
  }
  if (normalized.includes("RESPONSABLE INSCRIPTO")) {
    return "RESPONSABLE_INSCRIPTO";
  }
  if (normalizedWords.includes("LIBERADO") || normalizedWords.includes("19640")) {
    return "IVA_LIBERADO";
  }
  if (
    normalizedWords.includes("SUJETO NO CATEGORIZADO") ||
    normalizedWords.includes("NO CATEGORIZADO")
  ) {
    return "SUJETO_NO_CATEGORIZADO";
  }
  if (
    normalizedWords.includes("EXENTO") ||
    normalizedWords.includes("SUJETO EXENTO")
  ) {
    return "IVA_SUJETO_EXENTO";
  }
  if (
    normalizedWords.includes("NO ALCANZADO") ||
    normalizedWords.includes("NO ALCANZADA")
  ) {
    return "IVA_NO_ALCANZADO";
  }
  if (normalizedWords.includes("NO INSCRIPTO")) {
    return "SUJETO_NO_CATEGORIZADO";
  }
  if (
    (/\bIVA\b/.test(normalizedWords) ||
      normalizedWords.includes("IMPUESTO AL VALOR AGREGADO"))
  ) {
    return "RESPONSABLE_INSCRIPTO";
  }
  return null;
}

export function resolveInvoiceTypeFromFiscalTaxProfile(
  profile?: string | null
): "A" | "B" {
  const normalized = normalizeCustomerFiscalTaxProfile(profile);
  if (
    normalized === "RESPONSABLE_INSCRIPTO" ||
    normalized === "MONOTRIBUTISTA" ||
    normalized === "MONOTRIBUTO_SOCIAL" ||
    normalized === "MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO"
  ) {
    return "A";
  }
  return "B";
}

export function resolveCondicionIvaReceptor(
  profile?: string | null,
  invoiceType?: "A" | "B"
) {
  const normalized = normalizeCustomerFiscalTaxProfile(profile);
  if (normalized) {
    const byProfile: Record<CustomerFiscalTaxProfile, number> = {
      RESPONSABLE_INSCRIPTO: 1,
      MONOTRIBUTISTA: 6,
      MONOTRIBUTO_SOCIAL: 13,
      MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO: 16,
      CONSUMIDOR_FINAL: 5,
      IVA_SUJETO_EXENTO: 4,
      IVA_NO_ALCANZADO: 15,
      SUJETO_NO_CATEGORIZADO: 7,
      IVA_LIBERADO: 10,
    };
    return byProfile[normalized];
  }
  if (invoiceType === "A") {
    return 1;
  }
  return 5;
}

export function requiresRecipientTaxIdForFiscalTaxProfile(
  profile?: string | null
) {
  const normalized = normalizeCustomerFiscalTaxProfile(profile);
  return Boolean(normalized && normalized !== "CONSUMIDOR_FINAL");
}
