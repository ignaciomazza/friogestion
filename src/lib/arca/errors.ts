import type { ArcaConnectionJob, ArcaJobStep, ArcaJobStatus } from "@prisma/client";
import { resolveAfipEnv } from "@/lib/afip/env";
import { HELP_LINKS, type HelpLink } from "@/lib/afip/help";

type JobHelp = {
  statusMessage: string;
  helpLinks?: HelpLink[];
};

const STATUS_MESSAGES: Record<ArcaJobStatus, string> = {
  PENDING: "Pendiente de ejecucion.",
  RUNNING: "Procesando solicitud en ARCA.",
  WAITING: "ARCA esta procesando el pedido. Reintentar en unos segundos.",
  REQUIRES_ACTION: "Se requiere accion del usuario.",
  COMPLETED: "Conexion ARCA completada.",
  ERROR: "Se produjo un error al conectar con ARCA.",
};

const normalizeArcaMessage = (value: string) =>
  value.replace(/AFIP/gi, "ARCA");

function helpForStep(step: ArcaJobStep) {
  const env = resolveAfipEnv().env;
  const isProd = env === "production";

  if (step === "CREATE_CERT") {
    return [
      isProd ? HELP_LINKS.enableCertsProduction : HELP_LINKS.enableCertsTesting,
      isProd ? HELP_LINKS.certProduction : HELP_LINKS.certTesting,
    ];
  }

  if (step === "AUTH_WS") {
    return [isProd ? HELP_LINKS.wsAuthProduction : HELP_LINKS.wsAuthTesting];
  }

  return undefined;
}

export function describeArcaJob(job: ArcaConnectionJob): JobHelp {
  const base = STATUS_MESSAGES[job.status];

  if (job.status === "REQUIRES_ACTION" && job.lastError === "PASSWORD_REQUIRED") {
    return {
      statusMessage: "Clave fiscal expirada. Volve a ingresar la clave fiscal.",
    };
  }

  if (job.status === "ERROR") {
    return {
      statusMessage: job.lastError
        ? `Error ARCA: ${normalizeArcaMessage(job.lastError)}`
        : base,
      helpLinks: helpForStep(job.step),
    };
  }

  return {
    statusMessage: base,
    helpLinks: helpForStep(job.step),
  };
}

type ArcaErrorPayload = {
  code: string;
  error: string;
  helpLinks?: HelpLink[];
};

const ERROR_MESSAGES: Record<string, string> = {
  AFIP_SDK_ACCESS_TOKEN_REQUIRED: "Falta el token de acceso de ARCA.",
  ARCA_SECRETS_KEY_INVALID: "La clave de cifrado de ARCA es invalida.",
  ARCA_JOB_NOT_FOUND: "Proceso ARCA no encontrado.",
};

export function mapArcaError(error: unknown): ArcaErrorPayload {
  if (error instanceof Error) {
    const message = error.message;
    const known = ERROR_MESSAGES[message];
    if (known) {
      const helpLinks =
        message === "AFIP_SDK_ACCESS_TOKEN_REQUIRED"
          ? [HELP_LINKS.sdkToken]
          : undefined;
      return { code: message, error: normalizeArcaMessage(known), helpLinks };
    }
    return {
      code: "ARCA_ERROR",
      error: normalizeArcaMessage(message || "Error en ARCA."),
    };
  }
  return { code: "ARCA_ERROR", error: "Error en ARCA." };
}
