import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyReceiptToInstallments } from "@/lib/installments";

export const recalcSaleTotals = async (
  tx: Prisma.TransactionClient,
  saleId: string
) => {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    select: { id: true, total: true },
  });
  if (!sale) return;

  const summary = await tx.receiptLine.aggregate({
    where: { receipt: { saleId, status: "CONFIRMED" } },
    _sum: { amountBase: true },
  });
  const paidTotal = Number(summary._sum.amountBase ?? 0);
  const total = Number(sale.total ?? 0);
  const balance = Math.max(total - paidTotal, 0);
  const paymentStatus =
    paidTotal <= 0 ? "UNPAID" : balance <= 0.005 ? "PAID" : "PARTIAL";

  await tx.sale.update({
    where: { id: saleId },
    data: {
      paidTotal: paidTotal.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus,
    },
  });
};

export async function backfillPendingReceipts(
  organizationId: string,
  confirmedByUserId?: string
) {
  return prisma.$transaction(async (tx) => {
    const pendingReceipts = await tx.receipt.findMany({
      where: { organizationId, status: "PENDING" },
      include: {
        lines: {
          include: {
            accountMovement: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!pendingReceipts.length) return 0;

    let processed = 0;

    for (const receipt of pendingReceipts) {
      for (const line of receipt.lines) {
        if (!line.accountId || line.accountMovement) continue;
        await tx.accountMovement.create({
          data: {
            organizationId,
            accountId: line.accountId,
            occurredAt: receipt.receivedAt,
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            requiresVerification: true,
            note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
            receiptLineId: line.id,
          },
        });
      }

      const existingCurrentAccountEntry = await tx.currentAccountEntry.findFirst({
        where: {
          organizationId,
          receiptId: receipt.id,
          sourceType: "RECEIPT",
        },
        select: { id: true },
      });

      if (!existingCurrentAccountEntry) {
        await tx.currentAccountEntry.create({
          data: {
            organizationId,
            counterpartyType: "CUSTOMER",
            customerId: receipt.customerId,
            direction: "CREDIT",
            sourceType: "RECEIPT",
            saleId: receipt.saleId ?? undefined,
            receiptId: receipt.id,
            amount: receipt.total.toFixed(2),
            occurredAt: receipt.receivedAt,
            note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
          },
        });
      }

      if (receipt.saleId) {
        const existingInstallmentPayment = await tx.installmentPayment.findFirst({
          where: { receiptId: receipt.id },
          select: { id: true },
        });

        if (!existingInstallmentPayment) {
          await applyReceiptToInstallments(
            tx,
            receipt.saleId,
            receipt.id,
            Number(receipt.total ?? 0)
          );
        }
      }

      await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: receipt.confirmedAt ?? new Date(),
          confirmedByUserId:
            receipt.confirmedByUserId ??
            receipt.createdByUserId ??
            confirmedByUserId ??
            undefined,
        },
      });

      if (receipt.saleId) {
        await recalcSaleTotals(tx, receipt.saleId);
      }

      processed += 1;
    }

    return processed;
  });
}
