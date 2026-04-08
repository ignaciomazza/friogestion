import Afip from "@afipsdk/afip.js";
import { getAfipSdkAccessToken, resolveAfipEnv } from "@/lib/afip/env";

export function getArcaClient(taxIdRepresentado: string) {
  const accessToken = getAfipSdkAccessToken();
  if (!accessToken) {
    throw new Error("AFIP_SDK_ACCESS_TOKEN_REQUIRED");
  }

  const { production } = resolveAfipEnv();

  return new Afip({
    CUIT: Number(taxIdRepresentado),
    access_token: accessToken,
    production,
  });
}

export function getArcaEnvironment() {
  const { production } = resolveAfipEnv();
  return production ? "prod" : "dev";
}
