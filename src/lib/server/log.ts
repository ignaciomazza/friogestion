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
  const message = error instanceof Error ? error.message : "unknown_error";
  const stack = error instanceof Error ? error.stack : undefined;
  writeLog("error", { scope, message, stack, meta });
}
