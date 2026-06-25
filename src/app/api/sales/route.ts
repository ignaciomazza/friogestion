import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import {
  buildSaleOutMovements,
} from "@/lib/stock";
import { STOCK_ENABLED } from "@/lib/features";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import {
  EXTRA_CHARGE_TYPES,
  calculateSaleAdjustment,
  type ExtraChargeTypeValue,
} from "@/lib/sale-adjustments";
import { assertManualBillingStatusAllowed } from "@/lib/sales/fiscal";
import {
  buildSalesWhere,
  getSalesStatsSummary,
  parseSalesLimit,
  parseSalesOffset,
  parseSalesSort,
  salesListInclude,
  salesOrderBy,
  serializeSaleListItem,
} from "@/lib/sales/list";
import { recordOperationEvent } from "@/lib/operation-events";

const saleItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).max(100),
});

const saleItemUpdateSchema = z.object({
  id: z.string().min(1),
  unitPrice: z.coerce.number().positive(),
});

const saleSchema = z.object({
  customerId: z.string().min(1),
  saleNumber: z.string().min(1).optional(),
  saleDate: z.string().min(1).optional(),
  billingStatus: z.enum(["NOT_BILLED", "TO_BILL", "BILLED"]).optional(),
  extraType: z.enum(EXTRA_CHARGE_TYPES).optional(),
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
  items: z.array(saleItemUpdateSchema).min(1).optional(),
});

const PAYMENT_SETTLEMENT_TOLERANCE = 0.01;

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const calculateTotals = (
  items: Array<{ qty: number; unitPrice: number; taxRate: number }>,
  extraType?: ExtraChargeTypeValue,
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
  const extraAmount = calculateSaleAdjustment({
    subtotal,
    taxes,
    type: extraType,
    value: extraValue,
  }).amount;
  const total = subtotal + taxes + extraAmount;

  return { subtotal, taxes, extraAmount, total };
};

const normalizeBalanceForDisplay = (
  value: Prisma.Decimal | string | number | null | undefined
) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  if (Math.abs(parsed) <= PAYMENT_SETTLEMENT_TOLERANCE) return "0.00";
  return parsed.toFixed(2);
};

const endOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const serializeSale = (
  sale: {
    id: string;
    customer: {
      displayName: string;
      phone: string | null;
      taxId: string | null;
      type: string;
      fiscalTaxProfile: string;
    };
    saleNumber: string | null;
    fiscalInvoice?: {
      type: string | null;
      pointOfSale: string | null;
      number: string | null;
    } | null;
    saleDate: Date | null;
    createdAt: Date;
    subtotal: Prisma.Decimal | null;
    taxes: Prisma.Decimal | null;
    extraType: string | null;
    extraValue: Prisma.Decimal | null;
    extraAmount: Prisma.Decimal | null;
    total: Prisma.Decimal | null;
    paidTotal: Prisma.Decimal | null;
    balance: Prisma.Decimal | null;
    paymentStatus: string;
    status: string;
    billingStatus: string;
    items: Array<{
      id: string;
      product: { name: string };
      qty: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
      taxRate: Prisma.Decimal | null;
      taxAmount: Prisma.Decimal | null;
    }>;
    receipts?: Array<{
      lines: Array<{
        accountMovement: { verifiedAt: Date | null } | null;
      }>;
    }>;
    saleCharges?: Array<{ amount: Prisma.Decimal }>;
  }
) => ({
  hasPendingDoubleCheck: sale.receipts?.some((receipt) =>
    receipt.lines.some((line) =>
      line.accountMovement ? !line.accountMovement.verifiedAt : false
    )
  ) ?? false,
  id: sale.id,
  customerName: sale.customer.displayName,
  customerPhone: sale.customer.phone,
  customerTaxId: sale.customer.taxId,
  customerType: sale.customer.type,
  customerFiscalTaxProfile: sale.customer.fiscalTaxProfile,
  saleNumber: sale.saleNumber,
  fiscalInvoiceType: sale.fiscalInvoice?.type ?? null,
  fiscalInvoicePointOfSale: sale.fiscalInvoice?.pointOfSale ?? null,
  fiscalInvoiceNumber: sale.fiscalInvoice?.number ?? null,
  saleDate: sale.saleDate?.toISOString() ?? null,
  createdAt: sale.createdAt.toISOString(),
  subtotal: sale.subtotal?.toString() ?? null,
  taxes: sale.taxes?.toString() ?? null,
  extraType: sale.extraType ?? null,
  extraValue: sale.extraValue?.toString() ?? null,
  extraAmount: sale.extraAmount?.toString() ?? null,
  chargesTotal: sale.saleCharges
    ? round2(
        sale.saleCharges.reduce(
          (total, charge) => total + Number(charge.amount ?? 0),
          0
        )
      ).toFixed(2)
    : "0.00",
  total: sale.total?.toString() ?? null,
  paidTotal: sale.paidTotal?.toString() ?? "0",
  balance: normalizeBalanceForDisplay(sale.balance),
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
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = parseSalesLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseSalesOffset(req.nextUrl.searchParams.get("offset"));
    const sort = parseSalesSort(req.nextUrl.searchParams.get("sort"));
    const dateFromResult = parseOptionalDate(
      req.nextUrl.searchParams.get("dateFrom") ?? undefined,
    );
    const dateToResult = parseOptionalDate(
      req.nextUrl.searchParams.get("dateTo") ?? undefined,
    );

    if (dateFromResult.error || dateToResult.error) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const where = buildSalesWhere({
      organizationId,
      query,
      dateFrom: dateFromResult.date,
      dateTo: dateToResult.date ? endOfDay(dateToResult.date) : null,
    });

    const [total, sales, stats] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: salesListInclude,
        orderBy: salesOrderBy(sort),
        skip: offset,
        take: limit,
      }),
      getSalesStatsSummary(organizationId),
    ]);

    const nextOffset = offset + sales.length;
    const hasMore = nextOffset < total;

    return NextResponse.json({
      items: sales.map((sale) => serializeSaleListItem(sale)),
      total,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
      stats,
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, [...WRITE_ROLES]);
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
    try {
      assertManualBillingStatusAllowed(billingStatus);
    } catch {
      return NextResponse.json(
        {
          error:
            "El estado facturado se asigna solo al emitir comprobante fiscal.",
        },
        { status: 409 },
      );
    }

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

      await recordOperationEvent(tx, {
        organizationId,
        actorUserId: payload.userId,
        entityType: "SALE",
        entityId: created.id,
        action: "SALE_CREATED",
        summary: `Venta ${created.saleNumber ?? created.id} creada`,
        after: {
          saleNumber: created.saleNumber,
          customerId: body.customerId,
          billingStatus,
          total: total.toFixed(2),
        },
      });

      return created;
    });

    return NextResponse.json({
      id: sale.id,
      customerName: sale.customer.displayName,
      customerPhone: sale.customer.phone,
      saleNumber: sale.saleNumber,
      fiscalInvoiceType: null,
      fiscalInvoicePointOfSale: null,
      fiscalInvoiceNumber: null,
      saleDate: sale.saleDate?.toISOString() ?? null,
      createdAt: sale.createdAt.toISOString(),
      subtotal: sale.subtotal?.toString() ?? null,
      taxes: sale.taxes?.toString() ?? null,
      extraType: sale.extraType ?? null,
      extraValue: sale.extraValue?.toString() ?? null,
      extraAmount: sale.extraAmount?.toString() ?? null,
      total: sale.total?.toString() ?? null,
      paidTotal: sale.paidTotal?.toString() ?? "0",
      balance: normalizeBalanceForDisplay(sale.balance),
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
    const { payload, membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = saleUpdateSchema.parse(await req.json());

    const existing = await prisma.sale.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      include: {
        customer: true,
        items: { include: { product: true } },
        saleCharges: { select: { amount: true } },
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
        fiscalInvoice: {
          select: { id: true, type: true, pointOfSale: true, number: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    if (body.items?.length && existing.billingStatus === "BILLED") {
      return NextResponse.json(
        { error: "No se pueden editar importes de una venta ya facturada" },
        { status: 409 }
      );
    }

    if (body.items?.length && existing.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se pueden editar importes de una venta cancelada" },
        { status: 409 }
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
    if (body.billingStatus) {
      try {
        assertManualBillingStatusAllowed(body.billingStatus);
      } catch {
        return NextResponse.json(
          {
            error:
              "No se puede marcar la venta como facturada manualmente. Emite el comprobante fiscal.",
          },
          { status: 409 },
        );
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      let pricingUpdate:
        | {
            subtotal: number;
            taxes: number;
            extraAmount: number;
            total: number;
            paidTotal: number;
            balance: number;
            paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
          }
        | null = null;

      if (body.items?.length) {
        const updatesByItemId = new Map(
          body.items.map((item) => [item.id, item.unitPrice])
        );
        const invalidItem = body.items.find(
          (item) => !existing.items.some((saleItem) => saleItem.id === item.id)
        );
        if (invalidItem) {
          throw new Error("INVALID_SALE_ITEM");
        }

        const recalculatedItems = existing.items.map((item) => ({
          id: item.id,
          qty: Number(item.qty),
          unitPrice: updatesByItemId.get(item.id) ?? Number(item.unitPrice),
          taxRate: Number(item.taxRate ?? 0),
        }));

        const { subtotal, taxes, extraAmount, total } = calculateTotals(
          recalculatedItems,
          existing.extraType ?? undefined,
          existing.extraValue ? Number(existing.extraValue) : undefined
        );
        const chargesTotal = existing.saleCharges.reduce(
          (sum, charge) => sum + Number(charge.amount ?? 0),
          0
        );
        const nextTotal = round2(total + chargesTotal);
        const paidTotal = round2(Number(existing.paidTotal ?? 0));
        const rawBalance = round2(Math.max(nextTotal - paidTotal, 0));
        const balance =
          rawBalance <= PAYMENT_SETTLEMENT_TOLERANCE ? 0 : rawBalance;
        const paymentStatus =
          paidTotal <= 0
            ? "UNPAID"
            : balance === 0
              ? "PAID"
              : "PARTIAL";

        pricingUpdate = {
          subtotal: round2(subtotal),
          taxes: round2(taxes),
          extraAmount: round2(extraAmount),
          total: nextTotal,
          paidTotal,
          balance,
          paymentStatus,
        };

        for (const item of recalculatedItems) {
          await tx.saleItem.update({
            where: { id: item.id },
            data: {
              unitPrice: item.unitPrice.toFixed(2),
              total: round2(item.qty * item.unitPrice).toFixed(2),
              taxAmount: round2(
                item.qty * item.unitPrice * (item.taxRate / 100)
              ).toFixed(2),
            },
          });
        }
      }

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
          ...(pricingUpdate
            ? {
                subtotal: pricingUpdate.subtotal.toFixed(2),
                taxes: pricingUpdate.taxes.toFixed(2),
                extraAmount: pricingUpdate.extraAmount.toFixed(2),
                total: pricingUpdate.total.toFixed(2),
                paidTotal: pricingUpdate.paidTotal.toFixed(2),
                balance: pricingUpdate.balance.toFixed(2),
                paymentStatus: pricingUpdate.paymentStatus,
              }
            : {}),
        },
      });

      if (pricingUpdate) {
        await tx.currentAccountEntry.updateMany({
          where: {
            organizationId: membership.organizationId,
            saleId: updated.id,
            sourceType: "SALE",
          },
          data: {
            amount: pricingUpdate.total.toFixed(2),
          },
        });

        if (existing.quoteId) {
          await tx.quote.update({
            where: { id: existing.quoteId },
            data: {
              subtotal: pricingUpdate.subtotal.toFixed(2),
              taxes: pricingUpdate.taxes.toFixed(2),
              extraAmount: pricingUpdate.extraAmount.toFixed(2),
              total: pricingUpdate.total.toFixed(2),
            },
          });
        }
      }

      await tx.saleEvent.create({
        data: {
          organizationId: membership.organizationId,
          saleId: updated.id,
          actorUserId: payload.userId,
          action: "UPDATED",
          note:
            body.note ||
            (pricingUpdate ? "Importes actualizados antes de facturar" : undefined),
        },
      });

      const billingChanged =
        body.billingStatus && body.billingStatus !== existing.billingStatus;
      const summary = billingChanged
        ? body.billingStatus === "NOT_BILLED"
          ? `Venta ${updated.saleNumber ?? updated.id} marcada como registro interno`
          : `Venta ${updated.saleNumber ?? updated.id} marcada como pendiente de facturacion`
        : pricingUpdate
          ? `Importes de venta ${updated.saleNumber ?? updated.id} actualizados`
          : `Venta ${updated.saleNumber ?? updated.id} actualizada`;

      await recordOperationEvent(tx, {
        organizationId: membership.organizationId,
        actorUserId: payload.userId,
        entityType: "SALE",
        entityId: updated.id,
        action: billingChanged ? "SALE_BILLING_STATUS_UPDATED" : "SALE_UPDATED",
        summary,
        before: {
          saleNumber: existing.saleNumber,
          saleDate: existing.saleDate,
          billingStatus: existing.billingStatus,
          subtotal: existing.subtotal?.toString() ?? null,
          taxes: existing.taxes?.toString() ?? null,
          total: existing.total?.toString() ?? null,
        },
        after: {
          saleNumber: updated.saleNumber,
          saleDate: updated.saleDate,
          billingStatus: updated.billingStatus,
          subtotal: updated.subtotal?.toString() ?? null,
          taxes: updated.taxes?.toString() ?? null,
          total: updated.total?.toString() ?? null,
        },
      });

      const hydrated = await tx.sale.findUnique({
        where: { id: updated.id },
        include: {
          customer: true,
          items: { include: { product: true } },
          fiscalInvoice: {
            select: { type: true, pointOfSale: true, number: true },
          },
          saleCharges: { select: { amount: true } },
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
      });

      if (!hydrated) {
        throw new Error("SALE_NOT_FOUND");
      }

      return hydrated;
    });

    return NextResponse.json(serializeSale(sale));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_SALE_ITEM") {
      return NextResponse.json(
        { error: "Item de venta invalido" },
        { status: 400 }
      );
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
    const { membership, payload } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const existing = await prisma.sale.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        quoteId: true,
        saleNumber: true,
        billingStatus: true,
        fiscalInvoice: { select: { id: true } },
        fiscalInvoiceIssueJob: { select: { id: true, status: true } },
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
      await recordOperationEvent(tx, {
        organizationId,
        actorUserId: payload.userId,
        entityType: "SALE",
        entityId: id,
        action: "SALE_DELETED",
        summary: `Venta ${existing.saleNumber ?? existing.id} eliminada`,
        before: {
          id: existing.id,
          quoteId: existing.quoteId,
          saleNumber: existing.saleNumber,
          billingStatus: existing.billingStatus,
        },
      });

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
      await tx.fiscalInvoiceIssueJob.deleteMany({
        where: { organizationId, saleId: id },
      });
      if (existing.quoteId) {
        await tx.quote.updateMany({
          where: {
            id: existing.quoteId,
            organizationId,
            status: "ACCEPTED",
          },
          data: { status: "SENT" },
        });
      }
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
        { error: "La venta tiene registros asociados y no se puede cancelar" },
        { status: 409 }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2014"
    ) {
      return NextResponse.json(
        { error: "La venta tiene registros fiscales asociados" },
        { status: 409 }
      );
    }
    logServerError("api.sales.delete", error);
    return NextResponse.json({ error: "No se pudo cancelar" }, { status: 400 });
  }
}
