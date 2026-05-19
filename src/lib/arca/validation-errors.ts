import type { HelpLink } from "@/lib/afip/help";
import { HELP_LINKS, getArcaHelpLinks } from "@/lib/afip/help";
import { resolveAfipEnv } from "@/lib/afip/env";
import { ArcaServiceAuthorizationError } from "@/lib/arca/service-authorization";

type MappedArcaError = {
  code: string;
  error: string;
  helpLinks?: HelpLink[];
};

const MESSAGES: Record<string, string> = {
  CUIT_INVALID: "CUIT invalido.",
  ARCA_ISSUER_CUIT_INVALID: "CUIT emisor invalido para validar comprobante.",
  PURCHASE_VALIDATION_ISSUER_TAX_ID_REQUIRED:
    "Falta CUIT emisor del comprobante.",
  PURCHASE_VALIDATION_POINT_OF_SALE_REQUIRED:
    "Falta punto de venta del comprobante.",
  PURCHASE_VALIDATION_VOUCHER_TYPE_REQUIRED:
    "Falta tipo de comprobante para validar en ARCA.",
  PURCHASE_VALIDATION_VOUCHER_NUMBER_REQUIRED:
    "Falta numero de comprobante para validar en ARCA.",
  PURCHASE_VALIDATION_DATE_INVALID:
    "La fecha del comprobante no es valida.",
  ARCA_CONFIG_MISSING: "No hay configuracion ARCA para esta organizacion.",
  ARCA_CONFIG_NOT_CONNECTED: "La conexion ARCA no esta activa.",
  ARCA_SERVICE_NOT_AUTHORIZED:
    "El servicio ARCA requerido no esta autorizado para esta organizacion.",
  AFIP_ACCESS_TOKEN_REQUIRED: "Falta el token de acceso de ARCA.",
  AFIP_CERT_KEY_REQUIRED: "Faltan certificados de ARCA para esta organizacion.",
  AFIP_CUIT_REQUIRED: "Falta CUIT configurado para ARCA.",
  PURCHASE_NOT_FOUND: "No se encontro la compra para validar en ARCA.",
  PURCHASE_VALIDATION_REQUEST_MISSING:
    "Esta compra no tiene un pedido de validacion ARCA guardado.",
  ARCA_REQUEST_FAILED:
    "No se pudo comunicar con ARCA. Intenta nuevamente en unos segundos.",
};

const ARCA_HTTP_MESSAGES: Record<number, string> = {
  400: "ARCA rechazo la consulta por datos invalidos del comprobante.",
  401: "ARCA rechazo la autenticacion. Revisa token y certificados.",
  403: "ARCA rechazo el acceso al servicio solicitado.",
  404: "ARCA no encontro el servicio solicitado.",
  408: "ARCA tardo demasiado en responder. Intenta nuevamente.",
  429: "ARCA recibio demasiadas consultas. Espera unos segundos y reintenta.",
  500: "ARCA devolvio un error interno.",
  502: "ARCA no respondio correctamente. Intenta nuevamente.",
  503: "ARCA no esta disponible temporalmente.",
  504: "ARCA no respondio a tiempo.",
};

function normalizeMessage(value: string) {
  return value.replace(/AFIP/gi, "ARCA");
}

function defaultHelpLinks() {
  return getArcaHelpLinks(resolveAfipEnv().env);
}

function mapHttpValidationMessage(value: string) {
  const match = value.match(/^ARCA_HTTP_(\d{3})(?::\s*(.+))?$/i);
  if (!match) return null;
  const status = Number(match[1]);
  const detail = (match[2] ?? "").trim();
  const base = ARCA_HTTP_MESSAGES[status] ?? `ARCA devolvio HTTP ${status}.`;
  return detail ? `${base} Detalle: ${detail}.` : base;
}

function mapRuntimeValidationMessage(value: string) {
  if (value.startsWith("ARCA_RESPONSE_INVALID")) {
    return "ARCA respondio en un formato inesperado. Reintenta y, si persiste, revisa la configuracion del servicio.";
  }
  if (value === "ARCA_VALIDATION_ERROR" || value === "ARCA_ERROR") {
    return "No se pudo validar el comprobante en ARCA.";
  }
  return null;
}

export function mapArcaValidationError(error: unknown): MappedArcaError {
  if (error instanceof ArcaServiceAuthorizationError) {
    return {
      code: error.code,
      error: normalizeMessage(
        MESSAGES[error.code] ?? error.message ?? "Error de configuracion ARCA."
      ),
      helpLinks: error.helpLinks ?? defaultHelpLinks(),
    };
  }

  if (error instanceof Error) {
    const httpMessage = mapHttpValidationMessage(error.message);
    if (httpMessage) {
      return {
        code: "ARCA_VALIDATION_ERROR",
        error: normalizeMessage(httpMessage),
        helpLinks: defaultHelpLinks(),
      };
    }

    const runtimeMessage = mapRuntimeValidationMessage(error.message);
    if (runtimeMessage) {
      return {
        code: "ARCA_VALIDATION_ERROR",
        error: normalizeMessage(runtimeMessage),
        helpLinks: defaultHelpLinks(),
      };
    }

    const mapped = MESSAGES[error.message];
    if (mapped) {
      return {
        code: error.message,
        error: normalizeMessage(mapped),
        helpLinks:
          error.message === "AFIP_ACCESS_TOKEN_REQUIRED"
            ? [HELP_LINKS.sdkToken]
            : defaultHelpLinks(),
      };
    }
    return {
      code: "ARCA_VALIDATION_ERROR",
      error: normalizeMessage(error.message || "Error en ARCA."),
      helpLinks: defaultHelpLinks(),
    };
  }

  return {
    code: "ARCA_VALIDATION_ERROR",
    error: "Error en ARCA.",
    helpLinks: defaultHelpLinks(),
  };
}
