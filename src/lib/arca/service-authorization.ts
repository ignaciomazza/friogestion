import { prisma } from "@/lib/prisma";
import { resolveAfipEnv } from "@/lib/afip/env";
import { HELP_LINKS, getArcaHelpLinks, type HelpLink } from "@/lib/afip/help";

const REQUIRED_STATUS = "CONNECTED";

export class ArcaServiceAuthorizationError extends Error {
  code: string;
  service: string;
  helpLinks?: HelpLink[];

  constructor(code: string, service: string, message: string, helpLinks?: HelpLink[]) {
    super(message);
    this.code = code;
    this.service = service;
    this.helpLinks = helpLinks;
  }
}

function getServiceHelpLinks(service: string) {
  const env = resolveAfipEnv().env;
  const base = getArcaHelpLinks(env);
  if (service === "wsfe") {
    return [HELP_LINKS.salesPoint, ...base];
  }
  return base;
}

export async function ensureArcaServiceAuthorized(
  organizationId: string,
  service: string
) {
  const config = await prisma.organizationFiscalConfig.findUnique({
    where: { organizationId },
    select: { status: true, authorizedServices: true },
  });

  if (!config) {
    throw new ArcaServiceAuthorizationError(
      "ARCA_CONFIG_MISSING",
      service,
      "No hay configuracion ARCA activa para esta organizacion.",
      getServiceHelpLinks(service)
    );
  }

  if (config.status !== REQUIRED_STATUS) {
    throw new ArcaServiceAuthorizationError(
      "ARCA_CONFIG_NOT_CONNECTED",
      service,
      "La conexion ARCA no esta activa para esta organizacion.",
      getServiceHelpLinks(service)
    );
  }

  const services = new Set(
    (config.authorizedServices ?? []).map((item) => item.trim().toLowerCase())
  );
  if (!services.has(service.toLowerCase())) {
    throw new ArcaServiceAuthorizationError(
      "ARCA_SERVICE_NOT_AUTHORIZED",
      service,
      `El servicio ${service} no esta autorizado en ARCA para esta organizacion.`,
      getServiceHelpLinks(service)
    );
  }
}
