export type AfipEnvironment = "production" | "testing";

export function resolveAfipEnv(): { env: AfipEnvironment; production: boolean } {
  const raw = (process.env.AFIP_ENV ?? "testing").toLowerCase();
  const env: AfipEnvironment = raw === "production" ? "production" : "testing";

  return { env, production: env === "production" };
}

export function getAfipSdkAccessToken(): string | null {
  return (
    process.env.AFIP_SDK_ACCESS_TOKEN ??
    process.env.ACCESS_TOKEN ??
    process.env.AFIP_ACCESS_TOKEN ??
    null
  );
}
