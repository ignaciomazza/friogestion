import type { QuoteItemForm } from "./types";

export const QUOTE_STATUS_OPTIONS = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
};

export const QUOTE_STATUS_STYLES: Record<string, string> = {
  DRAFT:
    "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20",
  SENT:
    "bg-white text-sky-800 border border-sky-200",
  ACCEPTED:
    "bg-white text-emerald-800 border border-emerald-200",
  REJECTED:
    "bg-white text-rose-700 border border-rose-200",
  EXPIRED:
    "bg-white text-amber-800 border border-amber-200",
};

export const EMPTY_ITEM: QuoteItemForm = {
  productId: "",
  productSearch: "",
  qty: "",
  unitPrice: "",
  taxRate: "21",
  unitPriceSource: null,
};

export const QUOTE_TAX_RATE_OPTIONS = [
  { value: "21", label: "IVA 21%" },
  { value: "10.5", label: "IVA 10,5%" },
  { value: "0", label: "Sin IVA (0%)" },
] as const;

export const formatQuoteTaxRateLabel = (value: string | number | null | undefined) => {
  const rate = Number(value ?? 0);
  if (!Number.isFinite(rate)) return "0%";
  if (Math.abs(rate) < 0.0001) return "Sin IVA";
  if (Math.abs(rate - Math.round(rate)) < 0.001) {
    return `${Math.round(rate)}%`;
  }
  return `${rate.toString().replace(".", ",")}%`;
};
