type LogMeta = Record<string, unknown> | undefined;

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const fromEnv = process.env.SERVER_LOG_LEVEL?.trim().toLowerCase();
  if (
    fromEnv === "debug" ||
    fromEnv === "info" ||
    fromEnv === "warn" ||
    fromEnv === "error"
  ) {
    return fromEnv;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[resolveMinLevel()];
}

function redactText(value: string) {
  return value
    .replace(
      /\b(DATABASE_URL|DIRECT_URL|MERCADOPAGO_ACCESS_TOKEN|FRIOGESTION_[A-Z0-9_]*|STORE_FRONT_[A-Z0-9_]*|STOREFRONT_[A-Z0-9_]*)=([^\s"',}]+)/gi,
      "$1=[redacted]",
    )
    .replace(/\b(postgres(?:ql)?:\/\/)[^\s"',}]+/gi, "$1[redacted]")
    .replace(/\b(APP_USR|TEST)-[A-Za-z0-9_-]{12,}/g, "$1-[redacted]")
    .replace(/\bfgsf_[A-Za-z0-9_-]{12,}/g, "fgsf_[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]");
}

function redactMeta(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[redacted-depth]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactMeta(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /secret|token|key|password|authorization|cookie|database_url|direct_url/i.test(key)
        ? "[redacted]"
        : redactMeta(item, depth + 1),
    ]),
  );
}

function writeLog(level: LogLevel, payload: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({
    level,
    ...payload,
    at: new Date().toISOString(),
  });
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export function logServerDebug(scope: string, message: string, meta?: LogMeta) {
  writeLog("debug", { scope, message, meta });
}

export function logServerInfo(scope: string, message: string, meta?: LogMeta) {
  writeLog("info", { scope, message, meta });
}

export function logServerWarn(scope: string, message: string, meta?: LogMeta) {
  writeLog("warn", { scope, message, meta });
}

export function logServerError(scope: string, error: unknown, meta?: LogMeta) {
  const message =
    error instanceof Error ? redactText(error.message) : "unknown_error";
  const stack = error instanceof Error ? redactText(error.stack ?? "") : undefined;
  writeLog("error", { scope, message, stack, meta: redactMeta(meta) });
}
