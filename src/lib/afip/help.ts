import type { AfipEnvironment } from "@/lib/afip/env";

export type HelpLink = {
  label: string;
  url: string;
};

const BASE_ARCA = "https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca";

export function getArcaHelpLinks(env: AfipEnvironment): HelpLink[] {
  return [
    {
      label: "Obtener certificado de ARCA",
      url: `${BASE_ARCA}/${
        env === "production"
          ? "obtener-certificado-de-produccion"
          : "obtener-certificado-de-testing"
      }`,
    },
    {
      label: "Autorizar servicio web de ARCA",
      url: `${BASE_ARCA}/${
        env === "production"
          ? "autorizar-web-service-de-produccion"
          : "autorizar-web-service-de-testing"
      }`,
    },
    {
      label: "Crear punto de venta",
      url: `${BASE_ARCA}/crear-punto-de-venta`,
    },
  ];
}

export const HELP_LINKS = {
  sdkToken: {
    label: "Obtener token de acceso de ARCA",
    url: "https://app.afipsdk.com",
  },
  salesPoint: {
    label: "Crear punto de venta",
    url: `${BASE_ARCA}/crear-punto-de-venta`,
  },
  certTesting: {
    label: "Obtener certificado de ARCA",
    url: `${BASE_ARCA}/obtener-certificado-de-testing`,
  },
  certProduction: {
    label: "Obtener certificado de ARCA",
    url: `${BASE_ARCA}/obtener-certificado-de-produccion`,
  },
  wsAuthTesting: {
    label: "Autorizar servicio web de ARCA",
    url: `${BASE_ARCA}/autorizar-web-service-de-testing`,
  },
  wsAuthProduction: {
    label: "Autorizar servicio web de ARCA",
    url: `${BASE_ARCA}/autorizar-web-service-de-produccion`,
  },
  enableCertsTesting: {
    label: "Habilitar administrador de certificados",
    url: `${BASE_ARCA}/habilitar-administrador-de-certificados-de-testing`,
  },
  enableCertsProduction: {
    label: "Habilitar administrador de certificados",
    url: `${BASE_ARCA}/habilitar-administrador-de-certificados-de-produccion`,
  },
};
