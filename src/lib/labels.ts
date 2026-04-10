export const ROLE_OPTIONS = [
  "OWNER",
  "ADMIN",
  "SALES",
  "CASHIER",
  "VIEWER",
  "DEVELOPER",
] as const;

export const USER_MANAGEMENT_ROLE_OPTIONS = [
  "OWNER",
  "ADMIN",
  "SALES",
] as const;

export const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  OWNER: "Dueño",
  ADMIN: "Administración",
  SALES: "Ventas",
  CASHIER: "Caja",
  VIEWER: "Consulta",
  DEVELOPER: "Developer",
};

export function roleLabel(role?: string | null) {
  if (!role) return "Sin rol";
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}
