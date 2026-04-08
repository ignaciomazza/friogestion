export function isAuthError(error: unknown) {
  return (
    error instanceof Error &&
    ["UNAUTHORIZED", "FORBIDDEN", "NO_ACTIVE_ORG"].includes(error.message)
  );
}

export function authErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 401;
  return error.message === "FORBIDDEN" ? 403 : 401;
}
