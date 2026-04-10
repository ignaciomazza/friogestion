export const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;
export const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"] as const;
export const CASH_RECONCILIATION_ROLES = ADMIN_ROLES;

export function hasAnyRole(role: string | null | undefined, roles: readonly string[]) {
  return Boolean(role && roles.includes(role));
}

export function canWrite(role: string | null | undefined) {
  return hasAnyRole(role, WRITE_ROLES);
}

export function canAccessCashReconciliation(role: string | null | undefined) {
  return hasAnyRole(role, CASH_RECONCILIATION_ROLES);
}

export function canManageAdjustments(role: string | null | undefined) {
  return hasAnyRole(role, ADMIN_ROLES);
}

export function canCancelSupplierPayments(role: string | null | undefined) {
  return hasAnyRole(role, ADMIN_ROLES);
}
