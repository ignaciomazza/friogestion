import Afip from "@afipsdk/afip.js";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getCachedAfipClient, setCachedAfipClient } from "@/lib/afip/cache";
import { getAfipSdkAccessToken, resolveAfipEnv } from "@/lib/afip/env";

function decodePem(value?: string | null) {
  if (!value) return null;
  if (value.includes("BEGIN")) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) return decoded;
  } catch {
    return value;
  }
  return value;
}

function getEnvCertKey() {
  const cert = decodePem(process.env.AFIP_CERT_BASE64);
  const key = decodePem(process.env.AFIP_KEY_BASE64);
  if (!cert || !key) return null;
  return { cert, key };
}

async function getOrganizationCertKey(organizationId: string) {
  const config = await prisma.organizationFiscalConfig.findUnique({
    where: { organizationId },
  });

  if (!config?.certEncrypted || !config?.keyEncrypted) {
    return null;
  }

  const cert = decryptSecret(config.certEncrypted);
  const key = decryptSecret(config.keyEncrypted);

  return {
    cert,
    key,
    taxIdRepresentado: config.taxIdRepresentado,
  };
}

export async function getAfipClient(organizationId?: string) {
  const cacheKey = organizationId ?? "global";
  const cached = getCachedAfipClient(cacheKey);
  if (cached) return cached;

  const accessToken = getAfipSdkAccessToken();
  if (!accessToken) {
    throw new Error("AFIP_ACCESS_TOKEN_REQUIRED");
  }

  const { production } = resolveAfipEnv();

  let certKey = getEnvCertKey();
  let cuit = process.env.AFIP_CUIT ?? null;

  if (organizationId) {
    const orgCertKey = await getOrganizationCertKey(organizationId);
    if (orgCertKey?.cert && orgCertKey?.key) {
      certKey = { cert: orgCertKey.cert, key: orgCertKey.key };
    }
    if (orgCertKey?.taxIdRepresentado) {
      cuit = orgCertKey.taxIdRepresentado;
    }
  }

  if (!cuit) {
    throw new Error("AFIP_CUIT_REQUIRED");
  }

  if (!certKey) {
    throw new Error("AFIP_CERT_KEY_REQUIRED");
  }

  const client = new Afip({
    CUIT: Number(cuit),
    access_token: accessToken,
    production,
    cert: certKey.cert,
    key: certKey.key,
  });

  setCachedAfipClient(cacheKey, client);
  return client;
}
