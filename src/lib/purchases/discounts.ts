import type {
  PurchaseDiscountBase,
  PurchaseDiscountType,
} from "@/lib/purchases/fiscal";

export type PurchaseDiscountInput = {
  type: PurchaseDiscountType;
  base: PurchaseDiscountBase;
  value: number;
};

export type PurchaseDiscountBases = {
  subtotal: number;
  vat: number;
  total: number;
};

export const roundPurchaseMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function getPurchaseDiscountBaseAmount(
  base: PurchaseDiscountBase,
  amounts: PurchaseDiscountBases,
) {
  if (base === "VAT") return Math.max(0, amounts.vat);
  if (base === "TOTAL") return Math.max(0, amounts.total);
  return Math.max(0, amounts.subtotal);
}

export function calculatePurchaseDiscountAmount(input: {
  discount: PurchaseDiscountInput;
  bases: PurchaseDiscountBases;
}) {
  const baseAmount = getPurchaseDiscountBaseAmount(
    input.discount.base,
    input.bases,
  );
  const value = Math.max(0, Number(input.discount.value ?? 0));
  const rawAmount =
    input.discount.type === "PERCENT" ? baseAmount * (value / 100) : value;
  return roundPurchaseMoney(Math.min(Math.max(0, rawAmount), baseAmount));
}

export function applyPurchaseItemDiscount(input: {
  grossSubtotal: number;
  taxRate: number;
  taxAmountOverride?: number | null;
  discount: PurchaseDiscountInput;
}) {
  const grossSubtotal = Math.max(0, input.grossSubtotal);
  const taxRate = Math.max(0, input.taxRate);
  const hasTaxAmountOverride =
    typeof input.taxAmountOverride === "number" &&
    Number.isFinite(input.taxAmountOverride) &&
    input.taxAmountOverride >= 0;
  const grossVat = hasTaxAmountOverride
    ? roundPurchaseMoney(input.taxAmountOverride ?? 0)
    : roundPurchaseMoney(grossSubtotal * (taxRate / 100));
  const grossTotal = roundPurchaseMoney(grossSubtotal + grossVat);
  const discountAmount = calculatePurchaseDiscountAmount({
    discount: input.discount,
    bases: {
      subtotal: grossSubtotal,
      vat: grossVat,
      total: grossTotal,
    },
  });

  if (discountAmount <= 0) {
    return {
      grossSubtotal,
      grossVat,
      grossTotal,
      discountAmount: 0,
      subtotal: grossSubtotal,
      vat: grossVat,
      total: grossTotal,
    };
  }

  if (input.discount.base === "VAT") {
    const vat = roundPurchaseMoney(Math.max(0, grossVat - discountAmount));
    return {
      grossSubtotal,
      grossVat,
      grossTotal,
      discountAmount,
      subtotal: grossSubtotal,
      vat,
      total: roundPurchaseMoney(grossSubtotal + vat),
    };
  }

  if (input.discount.base === "TOTAL") {
    const total = roundPurchaseMoney(Math.max(0, grossTotal - discountAmount));
    const subtotalShare = grossTotal > 0 ? grossSubtotal / grossTotal : 1;
    const subtotal = roundPurchaseMoney(total * subtotalShare);
    const vat = roundPurchaseMoney(Math.max(0, total - subtotal));
    return {
      grossSubtotal,
      grossVat,
      grossTotal,
      discountAmount,
      subtotal,
      vat,
      total,
    };
  }

  const subtotal = roundPurchaseMoney(Math.max(0, grossSubtotal - discountAmount));
  const vat = hasTaxAmountOverride
    ? grossVat
    : roundPurchaseMoney(subtotal * (taxRate / 100));
  return {
    grossSubtotal,
    grossVat,
    grossTotal,
    discountAmount,
    subtotal,
    vat,
    total: roundPurchaseMoney(subtotal + vat),
  };
}

export function calculateGlobalPurchaseDiscount(input: {
  subtotal: number;
  vat: number;
  otherTaxesTotal: number;
  discount: PurchaseDiscountInput;
}) {
  const subtotal = Math.max(0, input.subtotal);
  const vat = Math.max(0, input.vat);
  const total = roundPurchaseMoney(
    subtotal + vat + Math.max(0, input.otherTaxesTotal),
  );
  return calculatePurchaseDiscountAmount({
    discount: input.discount,
    bases: {
      subtotal,
      vat,
      total,
    },
  });
}
