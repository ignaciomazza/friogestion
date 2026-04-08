import type { PurchaseItemForm } from "./types";

export const PURCHASE_STATUS_OPTIONS = [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
] as const;

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
};

export const PURCHASE_STATUS_STYLES: Record<string, string> = {
  DRAFT:
    "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20",
  CONFIRMED:
    "bg-white text-emerald-800 border border-emerald-200",
  CANCELLED:
    "bg-white text-rose-700 border border-rose-200",
};

export const PURCHASE_PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Impaga",
  PARTIAL: "Parcial",
  PAID: "Pagada",
};

export const PURCHASE_PAYMENT_STATUS_STYLES: Record<string, string> = {
  UNPAID:
    "bg-white text-rose-700 border border-rose-200",
  PARTIAL:
    "bg-white text-amber-800 border border-amber-200",
  PAID:
    "bg-white text-emerald-800 border border-emerald-200",
};

export const PURCHASE_ARCA_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  AUTHORIZED: "Autorizado",
  OBSERVED: "Observado",
  REJECTED: "Rechazado",
  ERROR: "Error",
};

export const PURCHASE_ARCA_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20",
  AUTHORIZED:
    "bg-white text-emerald-800 border border-emerald-200",
  OBSERVED: "bg-white text-amber-800 border border-amber-200",
  REJECTED: "bg-white text-rose-700 border border-rose-200",
  ERROR: "bg-slate-500/10 text-slate-700 border border-slate-200/25",
};

export const EMPTY_ITEM: PurchaseItemForm = {
  productId: "",
  productSearch: "",
  qty: "1",
  unitCost: "",
  unitPrice: "",
};
