import { resolveAfipEnv } from "@/lib/afip/env";
import { HELP_LINKS, getArcaHelpLinks, type HelpLink } from "@/lib/afip/help";

type ErrorPayload = {
  code: string;
  error: string;
  helpLinks?: HelpLink[];
  details?: string;
  resolution?:
    | {
        type: "USE_ISSUE_DATE";
        issueDate: string;
        title: string;
        description: string;
        primaryActionLabel: string;
      }
    | {
        type: "RECALCULATE_FISCAL_TOTALS";
        title: string;
        description: string;
        primaryActionLabel: string;
      };
};

const ERROR_MESSAGES: Record<string, string> = {
  SALE_NOT_FOUND: "La venta no existe o no pertenece a la organizacion.",
  SALE_ALREADY_BILLED: "La venta ya fue facturada.",
  SALE_CANCELLED: "No se puede facturar una venta cancelada.",
  SALE_STATUS_INVALID: "Solo se pueden facturar ventas confirmadas.",
  SALE_TOTALS_MISMATCH:
    "Los totales fiscales no coinciden con la venta. Revise recargos, descuentos o intereses antes de facturar.",
  SERVICE_DATES_NOT_SUPPORTED:
    "Este sistema solo emite comprobantes de productos (Concepto 1).",
  CONCEPTO_NOT_SUPPORTED:
    "El comprobante original no es de productos (Concepto 1).",
  DOC_TYPE_REQUIRED: "Falta tipo y numero de documento del receptor.",
  DOC_TYPE_UNSUPPORTED: "Solo se admite DNI o CUIT como documento.",
  FACTURA_A_REQUIRES_CUIT:
    "Factura A requiere CUIT valido del receptor.",
  DOC_NUMBER_INVALID: "El numero de documento es invalido.",
  CUSTOMER_TAX_ID_INVALID: "El CUIT del cliente es invalido.",
  SALES_POINT_MISSING:
    "No hay punto de venta habilitado en ARCA para este CUIT.",
  SALES_POINT_INVALID: "El punto de venta informado es invalido.",
  TAX_RATES_REQUIRED: "Faltan alicuotas de IVA para los items.",
  INVALID_TAX_RATE: "Alicuota de IVA invalida.",
  MANUAL_TOTALS_MISMATCH:
    "Los totales manuales no coinciden con neto + IVA (+ exento).",
  MANUAL_IVA_BREAKDOWN_REQUIRED:
    "Se requiere detalle de IVA cuando el total de IVA es mayor a cero.",
  MANUAL_IVA_BREAKDOWN_MISMATCH:
    "El detalle de IVA no coincide con el total informado.",
  NEGATIVE_TOTALS: "No se permiten importes negativos.",
  CURRENCY_QUOTE_NOT_FOUND:
    "No se encontro cotizacion valida para la moneda seleccionada.",
  AFIP_CAE_MISSING: "ARCA no devolvio CAE. Verifique los datos enviados.",
  AFIP_VOUCHER_NUMBER_MISSING:
    "ARCA no devolvio numero de comprobante.",
  AFIP_ACCESS_TOKEN_REQUIRED: "Falta el token de acceso de ARCA.",
  AFIP_CERT_KEY_REQUIRED: "Faltan certificados de ARCA para emitir comprobantes.",
  AFIP_CUIT_REQUIRED: "Falta CUIT para emitir comprobantes.",
  ISSUE_DATE_IN_FUTURE: "La fecha del comprobante no puede ser futura.",
  ISSUE_DATE_BEFORE_LAST_AUTHORIZED:
    "ARCA no permite emitir este comprobante con una fecha anterior al ultimo comprobante autorizado para el mismo punto de venta y tipo de factura.",
  FISCAL_INVOICE_NOT_FOUND: "Factura no encontrada.",
  FISCAL_INVOICE_ALREADY_ANNULLED:
    "La factura ya tiene una nota de credito asociada.",
  INVOICE_TYPE_INVALID: "Tipo de factura invalido.",
  INVOICE_VOUCHER_DATA_MISSING:
    "No hay datos de ARCA suficientes para emitir la nota de credito.",
  INVOICE_NUMBER_MISSING:
    "No se pudo determinar el numero del comprobante original.",
  FISCAL_ISSUE_JOB_ORG_CONFLICT:
    "Existe un conflicto de cola para esta venta. Reintente en unos segundos.",
};

const normalizeArcaMessage = (value: string) =>
  value.replace(/AFIP/gi, "ARCA");

function getHelpLinks(code: string) {
  const env = resolveAfipEnv().env;

  if (code === "SALES_POINT_MISSING" || code === "SALES_POINT_INVALID") {
    return [HELP_LINKS.salesPoint];
  }

  if (code === "AFIP_CERT_KEY_REQUIRED") {
    return getArcaHelpLinks(env);
  }

  return undefined;
}

function isIvaCalculationMismatch(message: string) {
  const lower = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    lower.includes("iva") &&
    (lower.includes("alicuota") ||
      lower.includes("base imponible") ||
      lower.includes("baseimp") ||
      lower.includes("importe"))
  );
}

function buildFiscalTotalsResolution() {
  return {
    type: "RECALCULATE_FISCAL_TOTALS" as const,
    title: "Recalcular IVA fiscal",
    description:
      "ARCA necesita que el IVA de cada alicuota cierre contra su base imponible. Volve a emitir con el calculo fiscal actualizado; si el ajuste era interes de tarjeta, revisa que la venta este cargada con ese criterio.",
    primaryActionLabel: "Recalcular y emitir",
  };
}

export function mapAfipError(error: unknown): ErrorPayload {
  if (error instanceof Error) {
    const message = error.message;
    const knownMessage = ERROR_MESSAGES[message];
    const errorWithResolution = error as Error & {
      suggestedIssueDate?: string;
      lastVoucherDate?: string;
      lastVoucherNumber?: number;
    };

    if (
      message === "ISSUE_DATE_BEFORE_LAST_AUTHORIZED" &&
      errorWithResolution.suggestedIssueDate
    ) {
      const suggestedDate = new Date(
        `${errorWithResolution.suggestedIssueDate}T00:00:00`
      ).toLocaleDateString("es-AR");
      const lastVoucherLabel = errorWithResolution.lastVoucherNumber
        ? ` Nro ${errorWithResolution.lastVoucherNumber}`
        : "";
      return {
        code: message,
        error: normalizeArcaMessage(
          knownMessage ?? "La fecha del comprobante no respeta la secuencia."
        ),
        details: errorWithResolution.lastVoucherDate ?? undefined,
        resolution: {
          type: "USE_ISSUE_DATE",
          issueDate: errorWithResolution.suggestedIssueDate,
          title: "Actualizar fecha de factura",
          description: `Ya existe un comprobante autorizado${lastVoucherLabel} con fecha ${suggestedDate}. Para mantener la numeracion correlativa, podes emitir esta factura con esa misma fecha.`,
          primaryActionLabel: `Usar fecha ${suggestedDate} y emitir`,
        },
      };
    }

    if (knownMessage) {
      if (message === "SALE_TOTALS_MISMATCH") {
        return {
          code: message,
          error: normalizeArcaMessage(knownMessage),
          helpLinks: getHelpLinks(message),
          resolution: buildFiscalTotalsResolution(),
        };
      }
      return {
        code: message,
        error: normalizeArcaMessage(knownMessage),
        helpLinks: getHelpLinks(message),
      };
    }

    const errorWithCode = error as Error & { code?: string | number };
    if (isIvaCalculationMismatch(message)) {
      return {
        code:
          errorWithCode.code !== undefined
            ? `AFIP_WS_${errorWithCode.code}`
            : "ARCA_IVA_MISMATCH",
        error:
          "ARCA rechazo la factura porque el IVA calculado no coincide con la base imponible enviada. Revisa recargos, descuentos o intereses antes de volver a emitir.",
        details:
          errorWithCode.code !== undefined
            ? String(errorWithCode.code)
            : undefined,
        resolution: buildFiscalTotalsResolution(),
      };
    }
    if (errorWithCode.code !== undefined) {
      return {
        code: `AFIP_WS_${errorWithCode.code}`,
        error: normalizeArcaMessage(errorWithCode.message || "Error en ARCA."),
        details: String(errorWithCode.code),
      };
    }

    return {
      code: "AFIP_ERROR",
      error: normalizeArcaMessage(error.message || "Error en ARCA."),
    };
  }

  return { code: "AFIP_ERROR", error: "Error en ARCA." };
}
