import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { recalcPurchaseTotals } from "@/lib/purchases";

const cancelSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(280).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = cancelSchema.parse(await req.json());

    const payment = await prisma.supplierPayment.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      include: {
        supplier: true,
        lines: true,
        allocations: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    if (payment.status === "CANCELLED") {
      return NextResponse.json(
        { error: "El pago ya fue anulado" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplierPayment.update({
        where: { id: payment.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByUserId: membership.userId,
          cancellationNote: body.note?.trim() || null,
        },
      });

      for (const line of payment.lines) {
        if (!line.accountId) continue;
        await tx.accountMovement.create({
          data: {
            organizationId: membership.organizationId,
            accountId: line.accountId,
            occurredAt: new Date(),
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            note: `Anulación pago proveedor ${payment.supplier.displayName}`,
          },
        });
      }

      await tx.currentAccountEntry.create({
        data: {
          organizationId: membership.organizationId,
          counterpartyType: "SUPPLIER",
          supplierId: payment.supplierId,
          direction: "CREDIT",
          sourceType: "SUPPLIER_PAYMENT",
          supplierPaymentId: payment.id,
          amount: (
            Number(payment.total ?? 0) + Number(payment.withheldTotal ?? 0)
          ).toFixed(2),
          occurredAt: new Date(),
          note: `Anulación pago proveedor ${payment.supplier.displayName}`,
        },
      });

      const purchaseIds = Array.from(
        new Set(payment.allocations.map((allocation) => allocation.purchaseInvoiceId))
      );
      for (const purchaseId of purchaseIds) {
        await recalcPurchaseTotals(tx, purchaseId);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo anular" },
      { status: 400 }
    );
  }
}
