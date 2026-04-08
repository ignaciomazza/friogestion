import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { applyReceiptToInstallments } from "@/lib/installments";
import {
  DEFAULT_RECEIPT_APPROVAL_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";

const confirmSchema = z.object({
  id: z.string().min(1),
});

const recalcSaleTotals = async (
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

export async function POST(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { receiptApprovalRoles: true },
    });
    const allowedRoles = resolveConfiguredRoles(
      org?.receiptApprovalRoles,
      DEFAULT_RECEIPT_APPROVAL_ROLES
    );
    const { payload } = await requireRole(req, allowedRoles);
    const body = confirmSchema.parse(await req.json());

    const receipt = await prisma.receipt.findFirst({
      where: { id: body.id, organizationId },
      include: {
        lines: { include: { paymentMethod: true } },
        sale: true,
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Cobro no encontrado" },
        { status: 404 }
      );
    }

    if (receipt.status !== "PENDING") {
      return NextResponse.json(
        { error: "El cobro ya fue procesado" },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const confirmAt = new Date();

      for (const line of receipt.lines) {
        if (!line.accountId) continue;
        const requiresVerification = line.paymentMethod.requiresDoubleCheck;
        await tx.accountMovement.create({
          data: {
            organizationId,
            accountId: line.accountId,
            occurredAt: receipt.receivedAt,
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            requiresVerification,
            note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
            receiptLineId: line.id,
          },
        });
      }

      const updatedReceipt = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: confirmAt,
          confirmedByUserId: payload.userId,
        },
      });

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "CUSTOMER",
          customerId: receipt.customerId,
          direction: "CREDIT",
          sourceType: "RECEIPT",
          saleId: receipt.saleId ?? undefined,
          receiptId: receipt.id,
          amount: Number(receipt.total ?? 0).toFixed(2),
          occurredAt: receipt.receivedAt,
          note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
        },
      });

      if (receipt.saleId) {
        await applyReceiptToInstallments(
          tx,
          receipt.saleId,
          receipt.id,
          Number(receipt.total ?? 0)
        );
        await recalcSaleTotals(tx, receipt.saleId);
      }

      return updatedReceipt;
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      confirmedAt: updated.confirmedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo confirmar" },
      { status: 400 }
    );
  }
}
