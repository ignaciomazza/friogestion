import { resolveAfipEnv } from "@/lib/afip/env";
import { HELP_LINKS, getArcaHelpLinks, type HelpLink } from "@/lib/afip/help";

type ErrorPayload = {
  code: string;
  error: string;
  helpLinks?: HelpLink[];
  details?: string;
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
  FISCAL_INVOICE_NOT_FOUND: "Factura no encontrada.",
  INVOICE_TYPE_INVALID: "Tipo de factura invalido.",
  INVOICE_VOUCHER_DATA_MISSING:
    "No hay datos de ARCA suficientes para emitir la nota de credito.",
  INVOICE_NUMBER_MISSING:
    "No se pudo determinar el numero del comprobante original.",
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

export function mapAfipError(error: unknown): ErrorPayload {
  if (error instanceof Error) {
    const message = error.message;
    const knownMessage = ERROR_MESSAGES[message];
    if (knownMessage) {
      return {
        code: message,
        error: normalizeArcaMessage(knownMessage),
        helpLinks: getHelpLinks(message),
      };
    }

    const errorWithCode = error as Error & { code?: string | number };
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
