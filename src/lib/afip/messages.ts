export type AfipMissingItem = {
  key: string;
  title: string;
  summary: string;
  description?: string;
};

const isMissing = (missing: string[], key: string) =>
  missing.includes(key);

const buildMissingItems = (missing: string[]) => {
  const items: AfipMissingItem[] = [];
  const handled = new Set<string>();

  if (isMissing(missing, "AFIP_SDK_ACCESS_TOKEN")) {
    items.push({
      key: "AFIP_SDK_ACCESS_TOKEN",
      title: "Token de acceso de ARCA",
      summary: "Falta el token de acceso de ARCA",
      description: "Consultar con soporte.",
    });
    handled.add("AFIP_SDK_ACCESS_TOKEN");
  }

  if (isMissing(missing, "ARCA_SECRETS_KEY")) {
    items.push({
      key: "ARCA_SECRETS_KEY",
      title: "Clave de cifrado de ARCA",
      summary: "Falta la clave de cifrado de ARCA",
      description: "Necesaria para guardar certificados.",
    });
    handled.add("ARCA_SECRETS_KEY");
  }

  const hasCert =
    isMissing(missing, "AFIP_CERT_BASE64") ||
    isMissing(missing, "AFIP_KEY_BASE64");
  if (hasCert) {
    items.push({
      key: "AFIP_CERTS",
      title: "Certificados ARCA (CRT/KEY)",
      summary: "Faltan certificados ARCA",
      description: "Cargar certificado y clave privada.",
    });
    handled.add("AFIP_CERT_BASE64");
    handled.add("AFIP_KEY_BASE64");
  }

  missing.forEach((key) => {
    if (handled.has(key)) return;
    items.push({
      key,
      title: "Configuracion de ARCA",
      summary: "Falta configuracion de ARCA",
      description: "Consultar con soporte.",
    });
  });

  return items;
};

export const getAfipMissingItems = (missing: string[]) =>
  buildMissingItems(missing);

export const summarizeAfipMissing = (
  missing: string[],
  fallback = ""
) => {
  const items = buildMissingItems(missing);
  if (!items.length) return fallback;
  if (items.length === 1) return items[0].summary;
  return "Faltan configuraciones de ARCA";
};
