import type { Prisma } from "@prisma/client";

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
  const balance = Math.max(total - paidTotal, 0);
  const paymentStatus =
    paidTotal <= 0 ? "UNPAID" : balance <= 0.005 ? "PAID" : "PARTIAL";

  await tx.purchaseInvoice.update({
    where: { id: purchaseId },
    data: {
      paidTotal: paidTotal.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus,
    },
  });
}
