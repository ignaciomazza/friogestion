import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { buildSaleOutMovements } from "@/lib/stock";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const confirmSchema = z.object({
  id: z.string().min(1),
});

const parseSequenceNumber = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const reserveNextCounter = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  key: string,
  fallbackLast: () => Promise<number | null>
) => {
  const counter = await tx.organizationCounter.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });

  if (!counter) {
    const lastNumber = (await fallbackLast()) ?? 0;
    const nextValue = lastNumber + 1;
    await tx.organizationCounter.create({
      data: { organizationId, key, nextValue: nextValue + 1 },
    });
    return nextValue;
  }

  const updated = await tx.organizationCounter.update({
    where: { organizationId_key: { organizationId, key } },
    data: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });

  return updated.nextValue - 1;
};

export async function POST(req: NextRequest) {
  try {
    const { payload, membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = confirmSchema.parse(await req.json());

    const quote = await prisma.quote.findFirst({
      where: { id: body.id, organizationId },
      include: {
        items: true,
        customer: true,
        sale: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Presupuesto no encontrado" },
        { status: 404 }
      );
    }

    if (quote.sale) {
      return NextResponse.json(
        { error: "Presupuesto ya confirmado" },
        { status: 409 }
      );
    }

    const subtotal = quote.items.reduce(
      (total, item) => total + Number(item.qty) * Number(item.unitPrice),
      0
    );
    const taxesFromItems = quote.items.reduce((total, item) => {
      if (item.taxAmount) return total + Number(item.taxAmount);
      const rate = Number(item.taxRate ?? 0);
      return total + Number(item.qty) * Number(item.unitPrice) * (rate / 100);
    }, 0);
    const taxes =
      taxesFromItems > 0 ? taxesFromItems : Number(quote.taxes ?? 0);
    const extraAmount = Number(quote.extraAmount ?? 0);
    const total = subtotal + taxes + extraAmount;

    const sale = await prisma.$transaction(async (tx) => {
      const nextSaleNumber = await reserveNextCounter(
        tx,
        organizationId,
        "sale-number",
        async () => {
          const lastSale = await tx.sale.findFirst({
            where: { organizationId, saleNumber: { not: null } },
            orderBy: { createdAt: "desc" },
            select: { saleNumber: true },
          });
          return parseSequenceNumber(lastSale?.saleNumber);
        }
      );

      const created = await tx.sale.create({
        data: {
          organizationId,
          customerId: quote.customerId,
          quoteId: quote.id,
          status: "CONFIRMED",
          billingStatus: "TO_BILL",
          saleNumber: nextSaleNumber.toString(),
          saleDate: new Date(),
          subtotal: subtotal.toFixed(2),
          taxes: taxes ? taxes.toFixed(2) : undefined,
          extraType: quote.extraType ?? undefined,
          extraValue: quote.extraValue?.toFixed(2) ?? undefined,
          extraAmount: extraAmount ? extraAmount.toFixed(2) : undefined,
          total: total.toFixed(2),
          paidTotal: "0.00",
          balance: total.toFixed(2),
          paymentStatus: "UNPAID",
          items: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              qty: item.qty.toFixed(3),
              unitPrice: item.unitPrice.toFixed(2),
              total: item.total.toFixed(2),
              taxRate: item.taxRate?.toFixed(2) ?? undefined,
              taxAmount: item.taxAmount?.toFixed(2) ?? undefined,
            })),
          },
        },
        include: { customer: true, items: true },
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: "ACCEPTED" },
      });

      await tx.saleEvent.create({
        data: {
          organizationId,
          saleId: created.id,
          actorUserId: payload.userId,
          action: "CREATED_FROM_QUOTE",
          note: `Presupuesto ${quote.quoteNumber ?? quote.id} confirmado.`,
        },
      });

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "CUSTOMER",
          customerId: quote.customerId,
          direction: "DEBIT",
          sourceType: "SALE",
          saleId: created.id,
          amount: total.toFixed(2),
          occurredAt: created.saleDate ?? new Date(),
          note: `Venta ${created.saleNumber ?? created.id}`,
        },
      });

      const saleStock = buildSaleOutMovements({
        organizationId,
        occurredAt: created.saleDate ?? new Date(),
        note: `Salida por venta ${created.saleNumber ?? created.id}`,
        items: created.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          qty: Number(item.qty),
        })),
      });
      if (saleStock.length) {
        await tx.stockMovement.createMany({ data: saleStock });
      }

      return created;
    });

    return NextResponse.json({
      id: sale.id,
      customerName: sale.customer.displayName,
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate?.toISOString() ?? null,
      createdAt: sale.createdAt.toISOString(),
      total: sale.total?.toString() ?? null,
      paidTotal: sale.paidTotal?.toString() ?? "0",
      balance: sale.balance?.toString() ?? "0",
      paymentStatus: sale.paymentStatus,
      status: sale.status,
      billingStatus: sale.billingStatus,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.quotes.confirm.post", error);
    return NextResponse.json({ error: "No se pudo confirmar" }, { status: 400 });
  }
}
