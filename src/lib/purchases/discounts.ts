import type {
  PurchaseDiscountBase,
  PurchaseDiscountType,
} from "@/lib/purchases/fiscal";

export type PurchaseDiscountInput = {
  type: PurchaseDiscountType;
  base: PurchaseDiscountBase;
  value: number;
};

export type PurchaseDiscountStepInput = PurchaseDiscountInput & {
  amount?: number;
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

export function normalizePurchaseDiscountSteps(
  discounts: PurchaseDiscountStepInput[] | null | undefined,
) {
  return (discounts ?? [])
    .map((discount) => ({
      type: discount.type,
      base: discount.base,
      value: Math.max(0, Number(discount.value ?? 0)),
      amount:
        typeof discount.amount === "number" && Number.isFinite(discount.amount)
          ? Math.max(0, discount.amount)
          : undefined,
    }))
    .filter((discount) => Number.isFinite(discount.value) && discount.value > 0);
}

export function applyPurchaseItemDiscount(input: {
  grossSubtotal: number;
  taxRate: number;
  taxAmountOverride?: number | null;
  discount?: PurchaseDiscountInput;
  discounts?: PurchaseDiscountStepInput[];
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
  const discountSteps = normalizePurchaseDiscountSteps(
    input.discounts ?? (input.discount ? [input.discount] : []),
  );
  let subtotal = grossSubtotal;
  let vat = grossVat;
  let total = roundPurchaseMoney(subtotal + vat);
  const grossTotal = total;
  let discountAmount = 0;

  for (const discount of discountSteps) {
    const amount = calculatePurchaseDiscountAmount({
      discount,
      bases: {
        subtotal,
        vat,
        total,
      },
    });
    if (amount <= 0) continue;
    discountAmount = roundPurchaseMoney(discountAmount + amount);

    if (discount.base === "VAT") {
      vat = roundPurchaseMoney(Math.max(0, vat - amount));
      total = roundPurchaseMoney(subtotal + vat);
      continue;
    }

    if (discount.base === "TOTAL") {
      total = roundPurchaseMoney(Math.max(0, total - amount));
      const subtotalShare = total + amount > 0 ? subtotal / (total + amount) : 1;
      subtotal = roundPurchaseMoney(total * subtotalShare);
      vat = roundPurchaseMoney(Math.max(0, total - subtotal));
      continue;
    }

    subtotal = roundPurchaseMoney(Math.max(0, subtotal - amount));
    vat = hasTaxAmountOverride
      ? vat
      : roundPurchaseMoney(subtotal * (taxRate / 100));
    total = roundPurchaseMoney(subtotal + vat);
  }

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
  discount?: PurchaseDiscountInput;
  discounts?: PurchaseDiscountStepInput[];
}) {
  const subtotal = Math.max(0, input.subtotal);
  const vat = Math.max(0, input.vat);
  const otherTaxesTotal = Math.max(0, input.otherTaxesTotal);
  const discountSteps = normalizePurchaseDiscountSteps(
    input.discounts ?? (input.discount ? [input.discount] : []),
  );
  let runningSubtotal = subtotal;
  let runningVat = vat;
  let runningOtherTaxesTotal = otherTaxesTotal;
  let runningTotal = roundPurchaseMoney(
    subtotal + vat + Math.max(0, input.otherTaxesTotal),
  );
  let discountTotal = 0;

  for (const discount of discountSteps) {
    const amount = calculatePurchaseDiscountAmount({
      discount,
      bases: {
        subtotal: runningSubtotal,
        vat: runningVat,
        total: runningTotal,
      },
    });
    if (amount <= 0) continue;
    discountTotal = roundPurchaseMoney(discountTotal + amount);

    if (discount.base === "VAT") {
      runningVat = roundPurchaseMoney(Math.max(0, runningVat - amount));
    } else if (discount.base === "TOTAL") {
      const nextTotal = roundPurchaseMoney(Math.max(0, runningTotal - amount));
      const subtotalShare =
        runningTotal > 0 ? runningSubtotal / runningTotal : 1;
      const vatShare = runningTotal > 0 ? runningVat / runningTotal : 0;
      runningSubtotal = roundPurchaseMoney(nextTotal * subtotalShare);
      runningVat = roundPurchaseMoney(nextTotal * vatShare);
      runningOtherTaxesTotal = roundPurchaseMoney(
        Math.max(0, nextTotal - runningSubtotal - runningVat),
      );
    } else {
      runningSubtotal = roundPurchaseMoney(
        Math.max(0, runningSubtotal - amount),
      );
    }

    runningTotal = roundPurchaseMoney(
      runningSubtotal + runningVat + runningOtherTaxesTotal,
    );
  }

  return discountTotal;
}
