export function parseIncludeUnverified(
  raw: string | null | undefined,
  fallback = false
) {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function verificationWhereClause(includeUnverified: boolean) {
  if (includeUnverified) {
    return {};
  }

  return {
    OR: [{ requiresVerification: false }, { verifiedAt: { not: null } }],
  };
}
