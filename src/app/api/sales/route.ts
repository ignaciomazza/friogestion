import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES, WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import {
  buildSaleOutMovements,
} from "@/lib/stock";
import { STOCK_ENABLED } from "@/lib/features";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const saleItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).max(100),
});

const saleSchema = z.object({
  customerId: z.string().min(1),
  saleNumber: z.string().min(1).optional(),
  saleDate: z.string().min(1).optional(),
  billingStatus: z.enum(["NOT_BILLED", "TO_BILL", "BILLED"]).optional(),
  extraType: z
    .enum(["PERCENT", "FIXED", "DISCOUNT_PERCENT", "DISCOUNT_FIXED"])
    .optional(),
  extraValue: z.coerce.number().min(0).optional(),
  adjustStock: z.boolean().optional(),
  items: z.array(saleItemSchema).min(1),
});

const saleUpdateSchema = z.object({
  id: z.string().min(1),
  billingStatus: z.enum(["NOT_BILLED", "TO_BILL", "BILLED"]).optional(),
  saleNumber: z.string().min(1).optional(),
  saleDate: z.string().min(1).optional(),
  note: z.string().max(280).optional(),
});

const calculateTotals = (
  items: Array<{ qty: number; unitPrice: number; taxRate: number }>,
  extraType?: "PERCENT" | "FIXED" | "DISCOUNT_PERCENT" | "DISCOUNT_FIXED",
  extraValue?: number
) => {
  const subtotal = items.reduce(
    (total, item) => total + item.qty * item.unitPrice,
    0
  );
  const taxes = items.reduce((total, item) => {
    const rate = item.taxRate ?? 0;
    return total + item.qty * item.unitPrice * (rate / 100);
  }, 0);
  const extraBase = extraValue ?? 0;
  const extraAmount =
    extraType === "PERCENT"
      ? subtotal * (extraBase / 100)
      : extraType === "FIXED"
        ? extraBase
        : extraType === "DISCOUNT_PERCENT"
          ? -(subtotal * (extraBase / 100))
          : extraType === "DISCOUNT_FIXED"
            ? -extraBase
            : 0;
  const total = subtotal + taxes + extraAmount;

  return { subtotal, taxes, extraAmount, total };
};

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

const ensureCounterAtLeast = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  key: string,
  value: number
) => {
  const counter = await tx.organizationCounter.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!counter) {
    await tx.organizationCounter.create({
      data: { organizationId, key, nextValue: value + 1 },
    });
    return;
  }
  if (counter.nextValue <= value) {
    await tx.organizationCounter.update({
      where: { organizationId_key: { organizationId, key } },
      data: { nextValue: value + 1 },
    });
  }
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const sales = await prisma.sale.findMany({
      where: { organizationId },
      include: {
        customer: true,
        items: { include: { product: true } },
        receipts: {
          where: { status: "CONFIRMED" },
          select: {
            lines: {
              select: {
                accountMovement: {
                  select: { verifiedAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      sales.map((sale) => ({
        hasPendingDoubleCheck: sale.receipts.some((receipt) =>
          receipt.lines.some(
            (line) =>
              line.accountMovement ? !line.accountMovement.verifiedAt : false
          )
        ),
        id: sale.id,
        customerName: sale.customer.displayName,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate?.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
        subtotal: sale.subtotal?.toString() ?? null,
        taxes: sale.taxes?.toString() ?? null,
        extraType: sale.extraType ?? null,
        extraValue: sale.extraValue?.toString() ?? null,
        extraAmount: sale.extraAmount?.toString() ?? null,
        total: sale.total?.toString() ?? null,
        paidTotal: sale.paidTotal?.toString() ?? "0",
        balance: sale.balance?.toString() ?? "0",
        paymentStatus: sale.paymentStatus,
        status: sale.status,
        billingStatus: sale.billingStatus,
        items: sale.items.map((item) => ({
          id: item.id,
          productName: item.product.name,
          qty: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          total: item.total.toString(),
          taxRate: item.taxRate?.toString() ?? null,
          taxAmount: item.taxAmount?.toString() ?? null,
        })),
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = saleSchema.parse(await req.json());

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, organizationId },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const productIds = Array.from(
      new Set(body.items.map((item) => item.productId))
    );

    const products = await prisma.product.findMany({
      where: { organizationId, id: { in: productIds } },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Producto invalido" },
        { status: 400 }
      );
    }

    const { subtotal, taxes, extraAmount, total } = calculateTotals(
      body.items,
      body.extraType,
      body.extraValue
    );

    const saleNumberInput = body.saleNumber?.trim() || undefined;
    const saleDateResult = parseOptionalDate(body.saleDate);
    if (saleDateResult.error) {
      return NextResponse.json(
        { error: "Fecha de venta invalida" },
        { status: 400 }
      );
    }
    const saleDate = saleDateResult.date ?? undefined;
    const billingStatus = body.billingStatus ?? "TO_BILL";

    const sale = await prisma.$transaction(async (tx) => {
      let saleNumber = saleNumberInput;
      if (!saleNumber) {
        const nextValue = await reserveNextCounter(
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
        saleNumber = nextValue.toString();
      } else {
        const manualValue = parseSequenceNumber(saleNumber);
        if (manualValue !== null) {
          await ensureCounterAtLeast(
            tx,
            organizationId,
            "sale-number",
            manualValue
          );
        }
      }

      const created = await tx.sale.create({
        data: {
          organizationId,
          customerId: body.customerId,
          status: "CONFIRMED",
          billingStatus,
          saleNumber,
          saleDate,
          subtotal: subtotal.toFixed(2),
          taxes: taxes ? taxes.toFixed(2) : undefined,
          extraType: body.extraType ?? undefined,
          extraValue:
            body.extraValue !== undefined
              ? body.extraValue.toFixed(2)
              : undefined,
          extraAmount: extraAmount ? extraAmount.toFixed(2) : undefined,
          total: total.toFixed(2),
          paidTotal: "0.00",
          balance: total.toFixed(2),
          paymentStatus: "UNPAID",
          items: {
            create: body.items.map((item) => ({
              productId: item.productId,
              qty: item.qty.toFixed(3),
              unitPrice: item.unitPrice.toFixed(2),
              total: (item.qty * item.unitPrice).toFixed(2),
              taxRate: item.taxRate.toFixed(2),
              taxAmount: (
                item.qty *
                item.unitPrice *
                (item.taxRate / 100)
              ).toFixed(2),
            })),
          },
        },
        include: { customer: true, items: true },
      });

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "CUSTOMER",
          customerId: body.customerId,
          direction: "DEBIT",
          sourceType: "SALE",
          saleId: created.id,
          amount: total.toFixed(2),
          occurredAt: saleDate ?? new Date(),
          note: `Venta ${created.saleNumber ?? created.id}`,
        },
      });

      if (STOCK_ENABLED && body.adjustStock !== false) {
        const stockMovements = buildSaleOutMovements({
          organizationId,
          occurredAt: created.saleDate ?? new Date(),
          note: `Salida por venta ${created.saleNumber ?? created.id}`,
          items: created.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            qty: Number(item.qty),
          })),
        });
        if (stockMovements.length) {
          await tx.stockMovement.createMany({ data: stockMovements });
        }
      }

      return created;
    });

    return NextResponse.json({
      id: sale.id,
      customerName: sale.customer.displayName,
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate?.toISOString() ?? null,
      createdAt: sale.createdAt.toISOString(),
      subtotal: sale.subtotal?.toString() ?? null,
      taxes: sale.taxes?.toString() ?? null,
      extraType: sale.extraType ?? null,
      extraValue: sale.extraValue?.toString() ?? null,
      extraAmount: sale.extraAmount?.toString() ?? null,
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
    logServerError("api.sales.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { payload, membership } = await requireRole(req, [...ADMIN_ROLES]);
    const body = saleUpdateSchema.parse(await req.json());

    const existing = await prisma.sale.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      select: {
        id: true,
        billingStatus: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    const saleDateResult = parseOptionalDate(body.saleDate);
    if (saleDateResult.error) {
      return NextResponse.json(
        { error: "Fecha de venta invalida" },
        { status: 400 }
      );
    }
    const saleDate = saleDateResult.date ?? undefined;
    const saleNumberInput = body.saleNumber?.trim() || undefined;

    const sale = await prisma.$transaction(async (tx) => {
      if (saleNumberInput) {
        const manualValue = parseSequenceNumber(saleNumberInput);
        if (manualValue !== null) {
          await ensureCounterAtLeast(
            tx,
            membership.organizationId,
            "sale-number",
            manualValue
          );
        }
      }

      const updated = await tx.sale.update({
        where: { id: body.id },
        data: {
          billingStatus: body.billingStatus ?? existing.billingStatus,
          saleDate,
          saleNumber: saleNumberInput ?? undefined,
        },
      });

      await tx.saleEvent.create({
        data: {
          organizationId: membership.organizationId,
          saleId: updated.id,
          actorUserId: payload.userId,
          action: "UPDATED",
          note: body.note || undefined,
        },
      });

      return updated;
    });

    return NextResponse.json({
      id: sale.id,
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
    logServerError("api.sales.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const organizationId = membership.organizationId;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const existing = await prisma.sale.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        billingStatus: true,
        fiscalInvoice: { select: { id: true } },
        receipts: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
        installmentPlan: { select: { id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    if (existing.billingStatus === "BILLED" || existing.fiscalInvoice) {
      return NextResponse.json(
        { error: "La venta ya esta facturada" },
        { status: 409 }
      );
    }

    if (existing.receipts.length) {
      return NextResponse.json(
        { error: "La venta tiene cobros asociados" },
        { status: 409 }
      );
    }

    if (existing.deliveryNotes.length) {
      return NextResponse.json(
        { error: "La venta tiene remitos asociados" },
        { status: 409 }
      );
    }

    if (existing.installmentPlan) {
      return NextResponse.json(
        { error: "La venta tiene un plan de cuotas asociado" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({
        where: {
          organizationId,
          saleItem: { saleId: id },
        },
      });
      await tx.saleCharge.deleteMany({
        where: { organizationId, saleId: id },
      });
      await tx.saleEvent.deleteMany({
        where: { organizationId, saleId: id },
      });
      await tx.currentAccountEntry.deleteMany({
        where: { organizationId, saleId: id, sourceType: "SALE" },
      });
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      });
      await tx.sale.delete({
        where: { id },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "La venta tiene movimientos asociados" },
        { status: 409 }
      );
    }
    logServerError("api.sales.delete", error);
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
