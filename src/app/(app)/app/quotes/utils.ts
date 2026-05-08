import { UNIT_LABELS, UNIT_VALUES } from "@/lib/units";
import type { CustomerOption, ProductOption } from "./types";

export const formatCustomerLabel = (customer: CustomerOption) =>
  `${customer.displayName}${customer.taxId ? ` - ${customer.taxId}` : ""}`;

export const formatProductLabel = (product: ProductOption) =>
  [
    product.name,
    product.sku ? `Int. ${product.sku}` : null,
    product.purchaseCode ? `Compra ${product.purchaseCode}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

export const normalizeQuery = (value: string) => value.trim().toLowerCase();

export const formatUnit = (unit: string | null) => {
  if (!unit) return "-";
  return UNIT_LABELS[unit as (typeof UNIT_VALUES)[number]] ?? unit ?? "-";
};
