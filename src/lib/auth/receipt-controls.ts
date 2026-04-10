export const DEFAULT_RECEIPT_APPROVAL_ROLES = ["OWNER", "ADMIN"] as const;
export const RECEIPT_DOUBLE_CHECK_ROLE_OPTIONS = ["OWNER", "ADMIN"] as const;
export const DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES =
  RECEIPT_DOUBLE_CHECK_ROLE_OPTIONS;

export function resolveConfiguredRoles(
  configured: string[] | null | undefined,
  fallback: readonly string[]
) {
  return configured?.length ? configured : [...fallback];
}

export function resolveReceiptDoubleCheckRoles(
  _configured: string[] | null | undefined
): string[] {
  return [...DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES];
}
