import type { Prisma } from "@prisma/client";

export const PURCHASE_PAYMENT_TOLERANCE = 0.005;

type PurchasePaymentDocumentType = string | null | undefined;

type PurchaseBalanceInput = {
  total?: number | string | null;
  paidTotal?: number | string | null;
  balance?: number | string | null;
};

const toPaymentNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function isPurchaseCreditNote(documentType: PurchasePaymentDocumentType) {
  return documentType === "CREDIT_NOTE";
}

export function getPurchaseAllocationSign(
  documentType: PurchasePaymentDocumentType
) {
  return isPurchaseCreditNote(documentType) ? -1 : 1;
}

export function getSignedPurchaseAllocationAmount(
  documentType: PurchasePaymentDocumentType,
  amount: number | string | null | undefined
) {
  return getPurchaseAllocationSign(documentType) * toPaymentNumber(amount);
}

export function getPurchaseOpenBalance(input: PurchaseBalanceInput) {
  const storedBalance = toPaymentNumber(input.balance);
  if (storedBalance > PURCHASE_PAYMENT_TOLERANCE) return storedBalance;
  const computedBalance = Math.max(
    toPaymentNumber(input.total) - toPaymentNumber(input.paidTotal),
    0
  );
  return computedBalance > PURCHASE_PAYMENT_TOLERANCE ? computedBalance : 0;
}

export async function recalcPurchaseTotals(
  tx: Prisma.TransactionClient,
  purchaseId: string
) {
  const purchase = await tx.purchaseInvoice.findUnique({
    where: { id: purchaseId },
    select: { id: true, total: true },
  });
  if (!purchase) return;

  const allocations = await tx.supplierPaymentAllocation.findMany({
    where: {
      purchaseInvoiceId: purchaseId,
      supplierPayment: { status: "CONFIRMED" },
    },
    select: { amount: true },
  });

  const paidTotal = allocations.reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0
  );
  const total = Number(purchase.total ?? 0);
  const balance = getPurchaseOpenBalance({
    total,
    paidTotal,
    balance: null,
  });
  const paymentStatus =
    paidTotal <= PURCHASE_PAYMENT_TOLERANCE
      ? "UNPAID"
      : balance <= PURCHASE_PAYMENT_TOLERANCE
        ? "PAID"
        : "PARTIAL";

  await tx.purchaseInvoice.update({
    where: { id: purchaseId },
    data: {
      paidTotal: paidTotal.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus,
    },
  });
}
