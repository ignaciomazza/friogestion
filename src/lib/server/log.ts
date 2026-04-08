type LogMeta = Record<string, unknown> | undefined;

export function logServerError(scope: string, error: unknown, meta?: LogMeta) {
  const message = error instanceof Error ? error.message : "unknown_error";
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message,
      stack,
      meta,
      at: new Date().toISOString(),
    })
  );
}
