export const DEFAULT_RECEIPT_APPROVAL_ROLES = ["OWNER", "ADMIN"] as const;
export const DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES = [
  "OWNER",
  "ADMIN",
  "CASHIER",
] as const;

export function resolveConfiguredRoles(
  configured: string[] | null | undefined,
  fallback: readonly string[]
) {
  return configured?.length ? configured : [...fallback];
}
