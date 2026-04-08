import { normalizeCuit } from "@/lib/arca/normalization";

export const CONSUMER_FINAL_IDENTIFICATION_THRESHOLD = 10_000_000;

const DOC_TYPE_MAP: Record<string, number> = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
};

type ResolveFiscalRecipientInput = {
  customerType?: string | null;
  customerTaxId?: string | null;
  explicitDocType?: string | number | null;
  explicitDocNumber?: string | null;
  totalAmount: number;
  requiresIncomeTaxDeduction?: boolean;
};

type ResolveFiscalRecipientOutput = {
  docType: number;
  docNumber: number;
  requireIdentification: boolean;
  identificationProvided: boolean;
  warnings: string[];
};

function parseDocType(input?: string | number | null) {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Number(input);
  }
  const upper = input.toUpperCase().trim();
  if (DOC_TYPE_MAP[upper]) return DOC_TYPE_MAP[upper];
  const numeric = Number(upper);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseDocNumber(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return { digits, number: parsed };
}

function isValidDoc(docType: number, digits: string) {
  if (docType === 80) {
    return digits.length === 11;
  }
  if (docType === 96) {
    return digits.length >= 7 && digits.length <= 8;
  }
  if (docType === 99) {
    return true;
  }
  return digits.length > 0;
}

export function evaluateConsumerFinalRule(input: {
  customerType?: string | null;
  totalAmount: number;
  requiresIncomeTaxDeduction?: boolean;
}) {
  const customerType = (input.customerType ?? "").toUpperCase();
  const isConsumerFinal = customerType === "CONSUMER_FINAL" || !customerType;
  const exceedsThreshold = input.totalAmount >= CONSUMER_FINAL_IDENTIFICATION_THRESHOLD;
  const requiresByDeduction = Boolean(input.requiresIncomeTaxDeduction);
  const requireIdentification =
    isConsumerFinal && (exceedsThreshold || requiresByDeduction);

  return {
    isConsumerFinal,
    exceedsThreshold,
    requiresByDeduction,
    requireIdentification,
    threshold: CONSUMER_FINAL_IDENTIFICATION_THRESHOLD,
  };
}

export function resolveFiscalRecipientDocument(
  input: ResolveFiscalRecipientInput
): ResolveFiscalRecipientOutput {
  const rule = evaluateConsumerFinalRule({
    customerType: input.customerType,
    totalAmount: input.totalAmount,
    requiresIncomeTaxDeduction: input.requiresIncomeTaxDeduction,
  });
  const warnings: string[] = [];

  const explicitType = parseDocType(input.explicitDocType);
  const explicitNumber = parseDocNumber(input.explicitDocNumber);
  if (explicitType && explicitNumber && isValidDoc(explicitType, explicitNumber.digits)) {
    return {
      docType: explicitType,
      docNumber: explicitNumber.number,
      requireIdentification: rule.requireIdentification,
      identificationProvided: true,
      warnings,
    };
  }

  if (input.explicitDocType || input.explicitDocNumber) {
    warnings.push("Documento receptor invalido; se usara consumidor final.");
  }

  const normalizedTaxId = normalizeCuit(input.customerTaxId ?? null);
  if (normalizedTaxId) {
    return {
      docType: DOC_TYPE_MAP.CUIT,
      docNumber: Number(normalizedTaxId),
      requireIdentification: rule.requireIdentification,
      identificationProvided: true,
      warnings,
    };
  }

  if (rule.exceedsThreshold) {
    warnings.push(
      `Operacion mayor o igual a ${CONSUMER_FINAL_IDENTIFICATION_THRESHOLD.toLocaleString(
        "es-AR"
      )} ARS sin identificacion del receptor.`
    );
  }
  if (rule.requiresByDeduction) {
    warnings.push(
      "El comprobante indica deduccion de Ganancias sin identificacion del receptor."
    );
  }

  return {
    docType: DOC_TYPE_MAP.CONSUMIDOR_FINAL,
    docNumber: 0,
    requireIdentification: rule.requireIdentification,
    identificationProvided: false,
    warnings,
  };
}
