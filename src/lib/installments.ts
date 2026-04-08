import type { Prisma } from "@prisma/client";

const roundMoney = (value: number) => Number(value.toFixed(2));

export async function applyReceiptToInstallments(
  tx: Prisma.TransactionClient,
  saleId: string,
  receiptId: string,
  amountBase: number
) {
  if (!Number.isFinite(amountBase) || amountBase <= 0) return;

  const plan = await tx.installmentPlan.findFirst({
    where: { saleId },
    select: { id: true },
  });

  if (!plan) return;

  const installments = await tx.installment.findMany({
    where: { planId: plan.id },
    orderBy: { number: "asc" },
  });

  let remaining = roundMoney(amountBase);

  for (const installment of installments) {
    if (remaining <= 0) break;
    const paidAmount = Number(installment.paidAmount ?? 0);
    const totalAmount = Number(installment.amount);
    const openAmount = roundMoney(totalAmount - paidAmount);
    if (openAmount <= 0) continue;

    const allocation = Math.min(openAmount, remaining);
    if (allocation <= 0) continue;

    await tx.installmentPayment.create({
      data: {
        installmentId: installment.id,
        receiptId,
        amount: allocation.toFixed(2),
      },
    });

    const newPaid = roundMoney(paidAmount + allocation);
    const fullyPaid = newPaid >= totalAmount - 0.005;
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        paidAmount: newPaid.toFixed(2),
        status: fullyPaid ? "PAID" : "PARTIAL",
        paidAt: fullyPaid ? new Date() : installment.paidAt ?? null,
      },
    });

    remaining = roundMoney(remaining - allocation);
  }
}
