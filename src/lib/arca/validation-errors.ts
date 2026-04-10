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
};

function normalizeMessage(value: string) {
  return value.replace(/AFIP/gi, "ARCA");
}

function defaultHelpLinks() {
  return getArcaHelpLinks(resolveAfipEnv().env);
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
