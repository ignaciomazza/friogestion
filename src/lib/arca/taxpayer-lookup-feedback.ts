import {
  inferFiscalTaxProfileFromArcaTaxStatus,
  type CustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";

export type TaxpayerLookupWarningSeverity = "warning" | "error";

export type TaxpayerLookupWarningCode =
  | "TAXPAYER_NOT_FOUND"
  | "TAX_ID_MISMATCH"
  | "LEGAL_NAME_MISSING"
  | "ADDRESS_MISSING"
  | "TAX_STATUS_MISSING"
  | "TAX_STATUS_UNKNOWN"
  | "STATE_NOT_ACTIVE";

export type TaxpayerLookupWarning = {
  code: TaxpayerLookupWarningCode;
  severity: TaxpayerLookupWarningSeverity;
  message: string;
  field?: "taxId" | "displayName" | "address" | "taxStatus" | "state";
};

type TaxpayerLookupWarningInput = {
  status?: string | null;
  queriedTaxId?: string | null;
  taxId?: string | null;
  legalName?: string | null;
  displayName?: string | null;
  address?: string | null;
  taxStatus?: string | null;
  state?: string | null;
  fiscalTaxProfile?: CustomerFiscalTaxProfile | null;
};

function normalizeTaxId(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function asLookupWarning(value: unknown): TaxpayerLookupWarning | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string" || !record.message.trim()) {
    return null;
  }
  if (
    typeof record.code !== "string" ||
    ![
      "TAXPAYER_NOT_FOUND",
      "TAX_ID_MISMATCH",
      "LEGAL_NAME_MISSING",
      "ADDRESS_MISSING",
      "TAX_STATUS_MISSING",
      "TAX_STATUS_UNKNOWN",
      "STATE_NOT_ACTIVE",
    ].includes(record.code)
  ) {
    return null;
  }
  const severity = record.severity === "error" ? "error" : "warning";
  const field =
    record.field === "taxId" ||
    record.field === "displayName" ||
    record.field === "address" ||
    record.field === "taxStatus" ||
    record.field === "state"
      ? record.field
      : undefined;

  return {
    code: record.code as TaxpayerLookupWarningCode,
    severity,
    message: record.message.trim(),
    field,
  };
}

export function buildTaxpayerLookupWarnings(
  input: TaxpayerLookupWarningInput
): TaxpayerLookupWarning[] {
  const queriedTaxId = normalizeTaxId(input.queriedTaxId);
  const returnedTaxId = normalizeTaxId(input.taxId);
  const status = normalizeText(input.status);
  const warnings: TaxpayerLookupWarning[] = [];

  if (status === "NO_ENCONTRADO") {
    return [
      {
        code: "TAXPAYER_NOT_FOUND",
        severity: "error",
        message:
          "ARCA no encontro un contribuyente para ese CUIT. Revisa que este bien escrito.",
        field: "taxId",
      },
    ];
  }

  if (queriedTaxId && returnedTaxId && queriedTaxId !== returnedTaxId) {
    warnings.push({
      code: "TAX_ID_MISMATCH",
      severity: "warning",
      message:
        "ARCA devolvio un CUIT distinto al consultado. Verifica el numero antes de guardar.",
      field: "taxId",
    });
  }

  const displayName = input.displayName?.trim() ?? "";
  const legalName = input.legalName?.trim() ?? "";
  if (!legalName && (!displayName || displayName === "Sin nombre")) {
    warnings.push({
      code: "LEGAL_NAME_MISSING",
      severity: "warning",
      message: "ARCA no informo razon social o nombre. Completalo manualmente.",
      field: "displayName",
    });
  }

  if (!input.address?.trim()) {
    warnings.push({
      code: "ADDRESS_MISSING",
      severity: "warning",
      message:
        "ARCA no informo domicilio fiscal. Cargalo manualmente si lo necesitas.",
      field: "address",
    });
  }

  const taxStatus = input.taxStatus?.trim() ?? "";
  const fiscalTaxProfile =
    input.fiscalTaxProfile ?? inferFiscalTaxProfileFromArcaTaxStatus(taxStatus);
  if (!taxStatus) {
    warnings.push({
      code: "TAX_STATUS_MISSING",
      severity: "warning",
      message:
        "ARCA no informo la condicion frente al IVA. Elegila manualmente antes de facturar.",
      field: "taxStatus",
    });
  } else if (!fiscalTaxProfile) {
    warnings.push({
      code: "TAX_STATUS_UNKNOWN",
      severity: "warning",
      message:
        "ARCA informo una condicion frente al IVA que no pudimos clasificar. Elegila manualmente antes de facturar.",
      field: "taxStatus",
    });
  }

  const state = normalizeText(input.state);
  if (state && !/\bACTIVO\b/.test(state)) {
    warnings.push({
      code: "STATE_NOT_ACTIVE",
      severity: "warning",
      message: `ARCA informo estado de clave fiscal: ${input.state}. Revisa si corresponde operar con este cliente.`,
      field: "state",
    });
  }

  return warnings;
}

export function readTaxpayerLookupWarnings(
  taxpayer: unknown
): TaxpayerLookupWarning[] {
  if (!taxpayer || typeof taxpayer !== "object") return [];
  const warnings = (taxpayer as { warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings
    .map(asLookupWarning)
    .filter((warning): warning is TaxpayerLookupWarning => Boolean(warning));
}

export function summarizeTaxpayerLookupWarnings(
  warnings: TaxpayerLookupWarning[]
) {
  return warnings.map((warning) => warning.message).join(" ");
}

export function hasTaxpayerLookupError(warnings: TaxpayerLookupWarning[]) {
  return warnings.some((warning) => warning.severity === "error");
}
