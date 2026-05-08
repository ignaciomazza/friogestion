export const EXTRA_CHARGE_TYPES = [
  "PERCENT",
  "FIXED",
  "DISCOUNT_PERCENT",
  "DISCOUNT_FIXED",
  "CARD_INTEREST_PERCENT",
  "CARD_INTEREST_FIXED",
] as const;

export type ExtraChargeTypeValue = (typeof EXTRA_CHARGE_TYPES)[number];

type SaleAdjustmentInput = {
  subtotal: number;
  taxes?: number | null;
  type?: string | null;
  value?: number | null;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeExtraChargeType(
  value?: string | null
): ExtraChargeTypeValue | null {
  return EXTRA_CHARGE_TYPES.includes(value as ExtraChargeTypeValue)
    ? (value as ExtraChargeTypeValue)
    : null;
}

export function isPercentAdjustment(type?: string | null) {
  return (
    type === "PERCENT" ||
    type === "DISCOUNT_PERCENT" ||
    type === "CARD_INTEREST_PERCENT"
  );
}

export function isDiscountAdjustment(type?: string | null) {
  return type === "DISCOUNT_PERCENT" || type === "DISCOUNT_FIXED";
}

export function isCardInterestAdjustment(type?: string | null) {
  return type === "CARD_INTEREST_PERCENT" || type === "CARD_INTEREST_FIXED";
}

export function getAdjustmentLabel(type?: string | null, amount?: number | null) {
  if (isCardInterestAdjustment(type)) return "Interes tarjeta";
  if (isDiscountAdjustment(type)) return "Descuento";
  if (type === "PERCENT" || type === "FIXED") return "Recargo";
  if (typeof amount === "number" && Number.isFinite(amount)) {
    if (amount > 0) return "Recargo";
    if (amount < 0) return "Descuento";
  }
  return "Ajuste";
}

export function calculateSaleAdjustment({
  subtotal,
  taxes,
  type,
  value,
}: SaleAdjustmentInput) {
  const normalizedType = normalizeExtraChargeType(type);
  const numericValue = Number(value ?? 0);
  const safeValue = Number.isFinite(numericValue) ? Math.max(numericValue, 0) : 0;
  const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
  const safeTaxes = Number.isFinite(Number(taxes ?? 0)) ? Number(taxes ?? 0) : 0;
  const cardInterestBase = round2(safeSubtotal + safeTaxes);

  let amount = 0;
  if (normalizedType === "PERCENT") {
    amount = safeSubtotal * (safeValue / 100);
  }
  if (normalizedType === "FIXED") {
    amount = safeValue;
  }
  if (normalizedType === "DISCOUNT_PERCENT") {
    amount = -(safeSubtotal * (safeValue / 100));
  }
  if (normalizedType === "DISCOUNT_FIXED") {
    amount = -safeValue;
  }
  if (normalizedType === "CARD_INTEREST_PERCENT") {
    amount = cardInterestBase * (safeValue / 100);
  }
  if (normalizedType === "CARD_INTEREST_FIXED") {
    amount = safeValue;
  }

  return {
    type: normalizedType,
    value: safeValue,
    amount: round2(amount),
    base:
      normalizedType === "CARD_INTEREST_PERCENT"
        ? cardInterestBase
        : safeSubtotal,
    label: getAdjustmentLabel(normalizedType, amount),
  };
}
