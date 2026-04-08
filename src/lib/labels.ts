export const ROLE_OPTIONS = ["OWNER", "ADMIN", "SALES", "CASHIER", "VIEWER"] as const;

export const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  SALES: "Ventas",
  CASHIER: "Caja",
  VIEWER: "Consulta",
};

export function roleLabel(role?: string | null) {
  if (!role) return "Sin rol";
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}
