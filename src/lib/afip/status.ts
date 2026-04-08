import { prisma } from "@/lib/prisma";
import { hasValidSecretsKey } from "@/lib/crypto/secrets";
import { getAfipSdkAccessToken, resolveAfipEnv } from "@/lib/afip/env";
import { getArcaHelpLinks, HELP_LINKS, type HelpLink } from "@/lib/afip/help";

export async function getAfipStatus(organizationId?: string) {
  const missing: string[] = [];
  const missingOptional: string[] = [];
  const helpLinks: HelpLink[] = [];
  const accessToken = getAfipSdkAccessToken();
  if (!accessToken) {
    missing.push("AFIP_SDK_ACCESS_TOKEN");
    helpLinks.push(HELP_LINKS.sdkToken);
  }

  if (!hasValidSecretsKey()) {
    missingOptional.push("ARCA_SECRETS_KEY");
  }

  let configStatus: string | null = null;
  let hasOrgCertKey = false;

  if (organizationId) {
    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId },
      select: {
        status: true,
        certEncrypted: true,
        keyEncrypted: true,
      },
    });
    if (config) {
      configStatus = config.status;
      hasOrgCertKey = Boolean(config.certEncrypted && config.keyEncrypted);
    }
  }

  const hasEnvCert =
    Boolean(process.env.AFIP_CERT_BASE64) && Boolean(process.env.AFIP_KEY_BASE64);
  const hasCertKey = hasOrgCertKey || hasEnvCert;
  if (!hasCertKey) {
    missingOptional.push("AFIP_CERT_BASE64");
    missingOptional.push("AFIP_KEY_BASE64");
  }

  const env = resolveAfipEnv().env;
  if (!hasCertKey || configStatus === "ERROR" || configStatus === "PENDING") {
    helpLinks.push(...getArcaHelpLinks(env));
  }

  return {
    ok: missing.length === 0 && hasCertKey,
    env,
    missing,
    missingOptional,
    configStatus,
    helpLinks: helpLinks.length ? helpLinks : undefined,
  };
}
