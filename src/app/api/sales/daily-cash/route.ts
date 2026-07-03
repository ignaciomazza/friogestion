import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { buildReceiptLines } from "@/lib/receipts/lines";
import { recalcSaleTotals } from "@/lib/receipts/backfill";
import { recordOperationEvent } from "@/lib/operation-events";
import { buildSaleOutMovements } from "@/lib/stock";
import { STOCK_ENABLED } from "@/lib/features";
import {
  CONSUMER_FINAL_DEFAULT_NAME,
  CUSTOMER_SYSTEM_KEYS,
} from "@/lib/customers/system-keys";
import { salesListInclude, serializeSaleListItem } from "@/lib/sales/list";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";

const TAX_RATE = 21;
const amountModeSchema = z.enum(["TOTAL", "NET", "TOTAL_UNIT", "NET_UNIT"]);

const quickSaleItemSchema = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().trim().max(140).optional(),
  qty: z.coerce.number().positive().default(1),
  amount: z.coerce.number().positive(),
  amountMode: amountModeSchema.default("TOTAL"),
  includesVat: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

const quickSaleSchema = z.object({
  saleDate: z.string().min(1).optional(),
  items: z.array(quickSaleItemSchema).min(1).optional(),
  productId: z.string().min(1).optional(),
  description: z.string().trim().max(140).optional(),
  qty: z.coerce.number().positive().default(1),
  amount: z.coerce.number().positive().optional(),
  amountMode: amountModeSchema.default("TOTAL"),
  includesVat: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  paymentMethodId: z.string().min(1),
  accountId: z.string().optional(),
  currencyCode: z.string().min(1).default("ARS"),
  fxRateUsed: z.coerce.number().positive().optional(),
}).refine((data) => data.items?.length || data.amount !== undefined, {
  message: "Debe informar al menos un item",
  path: ["items"],
});

const closeSchema = z.object({
  date: z.string().min(1),
});

const editItemSchema = z.object({
  id: z.string().min(1),
  qty: z.coerce.number().positive(),
  amount: z.coerce.number().positive(),
  amountMode: amountModeSchema.default("TOTAL"),
  includesVat: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

const editSchema = z.object({
  saleId: z.string().min(1),
  items: z.array(editItemSchema).min(1).optional(),
  qty: z.coerce.number().positive().optional(),
  amount: z.coerce.number().positive().optional(),
  amountMode: amountModeSchema.default("TOTAL"),
  includesVat: z.boolean().default(true),
  taxRate: z.coerce.number().min(0).max(100).optional(),
}).refine((data) => data.items?.length || data.amount !== undefined, {
  message: "Debe informar al menos un item",
  path: ["items"],
});

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const endOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
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
  fallbackLast: () => Promise<number | null>,
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

const resolveDailyTotals = ({
  amount,
  amountMode,
  taxRate,
  qty,
}: {
  amount: number;
  amountMode: z.infer<typeof amountModeSchema>;
  taxRate: number;
  qty: number;
}) => {
  const normalizedQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const amountBase =
    amountMode === "TOTAL_UNIT" || amountMode === "NET_UNIT"
      ? round2(amount * normalizedQty)
      : amount;

  if (taxRate <= 0) {
    return {
      subtotal: round2(amountBase),
      taxes: 0,
      total: round2(amountBase),
    };
  }

  if (amountMode === "NET" || amountMode === "NET_UNIT") {
    const subtotal = round2(amountBase);
    const taxes = round2(subtotal * (taxRate / 100));
    return {
      subtotal,
      taxes,
      total: round2(subtotal + taxes),
    };
  }

  const total = round2(amountBase);
  const subtotal = round2(total / (1 + taxRate / 100));
  return {
    subtotal,
    taxes: round2(total - subtotal),
    total,
  };
};

const calculateDailyItem = (
  item: z.infer<typeof quickSaleItemSchema>,
  index: number,
) => {
  const taxRate = item.taxRate ?? (item.includesVat ? TAX_RATE : 0);
  const { subtotal, taxes, total } = resolveDailyTotals({
    amount: item.amount,
    amountMode: item.amountMode,
    taxRate,
    qty: item.qty,
  });
  return {
    productId: item.productId,
    description: item.productId
      ? undefined
      : item.description?.trim() || (index === 0 ? "Venta diaria" : `Item ${index + 1}`),
    qty: item.qty,
    unitPrice: round2(subtotal / item.qty),
    subtotal,
    taxes,
    total,
    taxRate,
  };
};

const sumCalculatedItems = (
  items: Array<{ subtotal: number; taxes: number; total: number }>,
) => ({
  subtotal: round2(items.reduce((sum, item) => sum + item.subtotal, 0)),
  taxes: round2(items.reduce((sum, item) => sum + item.taxes, 0)),
  total: round2(items.reduce((sum, item) => sum + item.total, 0)),
});

const findOrCreateConsumerFinal = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
) => {
  const priceListForConsumerFinal = await tx.priceList.findFirst({
    where: {
      organizationId,
      isActive: true,
    },
    orderBy: [
      { isConsumerFinal: "desc" },
      { isDefault: "desc" },
      { name: "asc" },
    ],
    select: {
      id: true,
    },
  });

  return tx.customer.upsert({
    where: {
      organizationId_systemKey: {
        organizationId,
        systemKey: CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON,
      },
    },
    create: {
      organizationId,
      systemKey: CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON,
      displayName: CONSUMER_FINAL_DEFAULT_NAME,
      type: "CONSUMER_FINAL",
      fiscalTaxProfile: "CONSUMIDOR_FINAL",
      defaultPriceListId: priceListForConsumerFinal?.id ?? null,
    },
    update: {
      type: "CONSUMER_FINAL",
      fiscalTaxProfile: "CONSUMIDOR_FINAL",
      defaultPriceListId: priceListForConsumerFinal?.id ?? null,
    },
  });
};

const handleReceiptError = (error: Error) => {
  if (error.message === "INVALID_METHOD") {
    return NextResponse.json(
      { error: "Metodo de pago invalido" },
      { status: 400 },
    );
  }
  if (error.message === "INVALID_ACCOUNT") {
    return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
  }
  if (error.message === "ACCOUNT_REQUIRED") {
    return NextResponse.json(
      { error: "Cuenta requerida para el metodo" },
      { status: 400 },
    );
  }
  if (error.message === "ACCOUNT_CURRENCY_MISMATCH") {
    return NextResponse.json(
      { error: "La cuenta no coincide con la moneda" },
      { status: 400 },
    );
  }
  if (error.message === "FX_REQUIRED") {
    return NextResponse.json({ error: "Falta cotizacion" }, { status: 400 });
  }
  return null;
};

export async function POST(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = quickSaleSchema.parse(await req.json());
    const saleDateResult = parseOptionalDate(body.saleDate);

    if (saleDateResult.error) {
      return NextResponse.json(
        { error: "Fecha de venta invalida" },
        { status: 400 },
      );
    }

    const saleDate = saleDateResult.date ?? new Date();
    const inputItems =
      body.items?.length
        ? body.items
        : [
            {
              productId: body.productId,
              description: body.description,
              qty: body.qty,
              amount: body.amount ?? 0,
              amountMode: body.amountMode,
              includesVat: body.includesVat,
              taxRate: body.taxRate,
            },
          ];
    const calculatedItems = inputItems.map(calculateDailyItem);
    const { subtotal, taxes, total } = sumCalculatedItems(calculatedItems);

    const productIds = Array.from(
      new Set(
        calculatedItems
          .map((item) => item.productId)
          .filter((productId): productId is string => Boolean(productId)),
      ),
    );
    if (productIds.length) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, organizationId },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        return NextResponse.json(
          { error: "Producto invalido" },
          { status: 400 },
        );
      }
    }

    const { lines } = await buildReceiptLines(organizationId, [
      {
        paymentMethodId: body.paymentMethodId,
        accountId: body.accountId,
        currencyCode: body.currencyCode,
        amount:
          body.currencyCode.toUpperCase() === "ARS"
            ? total
            : body.fxRateUsed
              ? round2(total / body.fxRateUsed)
              : total,
        fxRateUsed: body.fxRateUsed,
      },
    ]);

    const sale = await prisma.$transaction(async (tx) => {
      const customer = await findOrCreateConsumerFinal(tx, organizationId);
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
        },
      );

      const created = await tx.sale.create({
        data: {
          organizationId,
          customerId: customer.id,
          status: "CONFIRMED",
          billingStatus: "TO_BILL",
          saleNumber: nextValue.toString(),
          saleDate,
          subtotal: subtotal.toFixed(2),
          taxes: taxes.toFixed(2),
          extraAmount: "0.00",
          total: total.toFixed(2),
          paidTotal: "0.00",
          balance: total.toFixed(2),
          paymentStatus: "UNPAID",
          items: {
            create: calculatedItems.map((item) => ({
              productId: item.productId ?? undefined,
              description: item.description,
              qty: item.qty.toFixed(3),
              unitPrice: item.unitPrice.toFixed(2),
              total: item.subtotal.toFixed(2),
              taxRate: item.taxRate.toFixed(2),
              taxAmount: item.taxes.toFixed(2),
            })),
          },
        },
        include: { items: true },
      });

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "CUSTOMER",
          customerId: customer.id,
          direction: "DEBIT",
          sourceType: "SALE",
          saleId: created.id,
          amount: total.toFixed(2),
          occurredAt: saleDate,
          note: `Venta diaria ${created.saleNumber ?? created.id}`,
        },
      });

      const confirmedAt = new Date();
      const receipt = await tx.receipt.create({
        data: {
          organizationId,
          customerId: customer.id,
          saleId: created.id,
          status: "CONFIRMED",
          createdByUserId: payload.userId,
          confirmedByUserId: payload.userId,
          confirmedAt,
          receivedAt: saleDate,
          total: total.toFixed(2),
          lines: {
            create: lines.map((line) => ({
              paymentMethodId: line.paymentMethodId,
              accountId: line.accountId ?? undefined,
              currencyCode: line.currencyCode,
              amount: line.amount,
              amountBase: line.amountBase,
              fxRateUsed: line.fxRateUsed ?? undefined,
            })),
          },
        },
        include: { lines: true },
      });

      for (const line of receipt.lines) {
        if (!line.accountId) continue;
        await tx.accountMovement.create({
          data: {
            organizationId,
            accountId: line.accountId,
            occurredAt: saleDate,
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            requiresVerification: true,
            note: `Cobro venta diaria ${created.saleNumber ?? created.id}`,
            receiptLineId: line.id,
          },
        });
      }

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "CUSTOMER",
          customerId: customer.id,
          direction: "CREDIT",
          sourceType: "RECEIPT",
          saleId: created.id,
          receiptId: receipt.id,
          amount: total.toFixed(2),
          occurredAt: saleDate,
          note: `Cobro venta diaria ${created.saleNumber ?? created.id}`,
        },
      });

      await recalcSaleTotals(tx, created.id);

      if (STOCK_ENABLED) {
        const stockMovements = buildSaleOutMovements({
          organizationId,
          occurredAt: saleDate,
          note: `Salida por venta diaria ${created.saleNumber ?? created.id}`,
          items: created.items
            .filter((item) => item.productId)
            .map((item) => ({
              id: item.id,
              productId: item.productId as string,
              qty: Number(item.qty),
            })),
        });
        if (stockMovements.length) {
          await tx.stockMovement.createMany({ data: stockMovements });
        }
      }

      await tx.saleEvent.create({
        data: {
          organizationId,
          saleId: created.id,
          actorUserId: payload.userId,
          action: "DAILY_CASH_CREATED",
          note: "Venta creada desde caja diaria",
        },
      });

      await recordOperationEvent(tx, {
        organizationId,
        actorUserId: payload.userId,
        entityType: "SALE",
        entityId: created.id,
        action: "DAILY_CASH_CREATED",
        summary: `Venta diaria ${created.saleNumber ?? created.id} creada`,
        after: {
          saleNumber: created.saleNumber,
          total: total.toFixed(2),
          itemCount: calculatedItems.length,
          paymentMethodId: body.paymentMethodId,
          accountId: body.accountId ?? null,
        },
      });

      const hydrated = await tx.sale.findUnique({
        where: { id: created.id },
        include: salesListInclude,
      });
      if (!hydrated) throw new Error("SALE_NOT_FOUND");
      return hydrated;
    });

    return NextResponse.json(serializeSaleListItem(sale));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
      const receiptError = handleReceiptError(error);
      if (receiptError) return receiptError;
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.sales.daily-cash.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const rawBody = await req.json();

    if (
      rawBody &&
      typeof rawBody === "object" &&
      !Array.isArray(rawBody) &&
      "saleId" in rawBody
    ) {
      const body = editSchema.parse(rawBody);

      const sale = await prisma.$transaction(async (tx) => {
        const existing = await tx.sale.findFirst({
          where: {
            id: body.saleId,
            organizationId,
            saleEvents: { some: { action: "DAILY_CASH_CREATED" } },
          },
          include: {
            items: {
              include: {
                product: true,
                stockMovement: true,
              },
            },
            receipts: {
              where: { status: "CONFIRMED" },
              include: {
                lines: {
                  include: {
                    accountMovement: true,
                  },
                },
              },
            },
            fiscalInvoice: { select: { id: true } },
          },
        });

        if (!existing) throw new Error("DAILY_SALE_NOT_FOUND");
        if (existing.status === "CANCELLED") throw new Error("SALE_CANCELLED");
        if (existing.billingStatus === "BILLED" || existing.fiscalInvoice) {
          throw new Error("SALE_BILLED");
        }

        const receipt = existing.receipts[0];
        const receiptLine = receipt?.lines[0];
        if (!existing.items.length) throw new Error("DAILY_ITEM_NOT_FOUND");
        if (!receipt || !receiptLine) throw new Error("DAILY_RECEIPT_NOT_FOUND");
        if (existing.receipts.length !== 1 || receipt.lines.length !== 1) {
          throw new Error("DAILY_RECEIPT_COMPLEX");
        }

        const legacyItem = existing.items[0];
        const inputItems =
          body.items?.length
            ? body.items
            : legacyItem
              ? [
                  {
                    id: legacyItem.id,
                    qty: body.qty ?? Number(legacyItem.qty),
                    amount:
                      body.amount ??
                      round2(Number(legacyItem.total ?? 0) + Number(legacyItem.taxAmount ?? 0)),
                    amountMode: body.amountMode,
                    includesVat: body.includesVat,
                    taxRate: body.taxRate,
                  },
                ]
              : [];
        if (!inputItems.length) throw new Error("DAILY_ITEM_NOT_FOUND");

        const existingById = new Map(
          existing.items.map((saleItem) => [saleItem.id, saleItem]),
        );
        const invalidItem = inputItems.find(
          (inputItem) => !existingById.has(inputItem.id),
        );
        if (invalidItem) throw new Error("DAILY_ITEM_INVALID");

        const updatesById = new Map(inputItems.map((inputItem) => [inputItem.id, inputItem]));
        const calculatedItems = existing.items.map((saleItem) => {
          const update = updatesById.get(saleItem.id);
          if (!update) {
            const subtotal = round2(Number(saleItem.total ?? 0));
            const taxes = round2(Number(saleItem.taxAmount ?? 0));
            const qty = Number(saleItem.qty ?? 0);
            return {
              saleItem,
              qty,
              unitPrice: Number(saleItem.unitPrice ?? 0),
              subtotal,
              taxes,
              total: round2(subtotal + taxes),
              taxRate: Number(saleItem.taxRate ?? 0),
            };
          }

          const { subtotal, taxes, total } = resolveDailyTotals({
            amount: update.amount,
            amountMode: update.amountMode,
            taxRate: update.taxRate ?? (update.includesVat ? TAX_RATE : 0),
            qty: update.qty,
          });
          return {
            saleItem,
            qty: update.qty,
            unitPrice: round2(subtotal / update.qty),
            subtotal,
            taxes,
            total,
            taxRate: update.taxRate ?? (update.includesVat ? TAX_RATE : 0),
          };
        });
        const { subtotal, taxes, total } = sumCalculatedItems(calculatedItems);

        const receiptCurrency = receiptLine.currencyCode.toUpperCase();
        const fxRate = receiptLine.fxRateUsed
          ? Number(receiptLine.fxRateUsed)
          : null;
        const receiptAmount =
          receiptCurrency === "ARS"
            ? total
            : fxRate && Number.isFinite(fxRate) && fxRate > 0
              ? round2(total / fxRate)
              : Number(receiptLine.amount ?? 0);

        for (const item of calculatedItems) {
          await tx.saleItem.update({
            where: { id: item.saleItem.id },
            data: {
              qty: item.qty.toFixed(3),
              unitPrice: item.unitPrice.toFixed(2),
              total: item.subtotal.toFixed(2),
              taxRate: item.taxRate.toFixed(2),
              taxAmount: item.taxes.toFixed(2),
            },
          });

          if (STOCK_ENABLED && item.saleItem.productId) {
            await tx.stockMovement.updateMany({
              where: {
                organizationId,
                saleItemId: item.saleItem.id,
              },
              data: {
                qty: item.qty.toFixed(3),
                occurredAt: existing.saleDate ?? new Date(),
                note: `Salida por venta diaria ${existing.saleNumber ?? existing.id}`,
              },
            });
          }
        }

        const updated = await tx.sale.update({
          where: { id: existing.id },
          data: {
            subtotal: subtotal.toFixed(2),
            taxes: taxes.toFixed(2),
            total: total.toFixed(2),
          },
        });

        await tx.receipt.update({
          where: { id: receipt.id },
          data: { total: total.toFixed(2) },
        });
        await tx.receiptLine.update({
          where: { id: receiptLine.id },
          data: {
            amount: receiptAmount.toFixed(2),
            amountBase: total.toFixed(2),
          },
        });
        if (receiptLine.accountMovement) {
          await tx.accountMovement.update({
            where: { id: receiptLine.accountMovement.id },
            data: {
              amount: receiptAmount.toFixed(2),
              occurredAt: receipt.receivedAt,
            },
          });
        }

        await tx.currentAccountEntry.updateMany({
          where: {
            organizationId,
            saleId: existing.id,
            sourceType: "SALE",
          },
          data: { amount: total.toFixed(2) },
        });
        await tx.currentAccountEntry.updateMany({
          where: {
            organizationId,
            receiptId: receipt.id,
            sourceType: "RECEIPT",
          },
          data: { amount: total.toFixed(2) },
        });

        await recalcSaleTotals(tx, existing.id);

        await tx.saleEvent.create({
          data: {
            organizationId,
            saleId: existing.id,
            actorUserId: payload.userId,
            action: "DAILY_CASH_UPDATED",
            note: "Venta diaria editada con cobro automatico ajustado.",
          },
        });
        await recordOperationEvent(tx, {
          organizationId,
          actorUserId: payload.userId,
          entityType: "SALE",
          entityId: existing.id,
          action: "DAILY_CASH_UPDATED",
          summary: `Venta diaria ${existing.saleNumber ?? existing.id} actualizada`,
          before: {
            subtotal: existing.subtotal?.toString() ?? null,
            taxes: existing.taxes?.toString() ?? null,
            total: existing.total?.toString() ?? null,
            receiptTotal: receipt.total?.toString() ?? null,
          },
          after: {
            subtotal: updated.subtotal?.toString() ?? null,
            taxes: updated.taxes?.toString() ?? null,
            total: updated.total?.toString() ?? null,
            receiptTotal: total.toFixed(2),
          },
        });

        const hydrated = await tx.sale.findUnique({
          where: { id: existing.id },
          include: salesListInclude,
        });
        if (!hydrated) throw new Error("SALE_NOT_FOUND");
        return hydrated;
      });

      return NextResponse.json(serializeSaleListItem(sale));
    }

    const body = closeSchema.parse(rawBody);
    const dateResult = parseOptionalDate(body.date);

    if (dateResult.error || !dateResult.date) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const dateFrom = dateResult.date;
    const dateTo = endOfDay(dateFrom);

    const closed = await prisma.$transaction(async (tx) => {
      const sales = await tx.sale.findMany({
        where: {
          organizationId,
          status: "CONFIRMED",
          billingStatus: "TO_BILL",
          fiscalInvoice: null,
          saleEvents: { some: { action: "DAILY_CASH_CREATED" } },
          OR: [
            { saleDate: { gte: dateFrom, lte: dateTo } },
            { saleDate: null, createdAt: { gte: dateFrom, lte: dateTo } },
          ],
        },
        select: {
          id: true,
          saleNumber: true,
          billingStatus: true,
          total: true,
        },
      });

      for (const sale of sales) {
        const updated = await tx.sale.update({
          where: { id: sale.id },
          data: { billingStatus: "NOT_BILLED" },
        });
        await tx.saleEvent.create({
          data: {
            organizationId,
            saleId: sale.id,
            actorUserId: payload.userId,
            action: "DAILY_CASH_CLOSED",
            note: "Caja diaria cerrada. Venta marcada como registro interno.",
          },
        });
        await recordOperationEvent(tx, {
          organizationId,
          actorUserId: payload.userId,
          entityType: "SALE",
          entityId: sale.id,
          action: "DAILY_CASH_CLOSED",
          summary: `Venta diaria ${sale.saleNumber ?? sale.id} marcada como registro interno`,
          before: {
            billingStatus: sale.billingStatus,
            total: sale.total?.toString() ?? null,
          },
          after: {
            billingStatus: updated.billingStatus,
            total: updated.total?.toString() ?? null,
          },
        });
      }

      return sales.length;
    });

    return NextResponse.json({ ok: true, closed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === "DAILY_SALE_NOT_FOUND") {
        return NextResponse.json(
          { error: "Venta diaria no encontrada" },
          { status: 404 },
        );
      }
      if (error.message === "SALE_CANCELLED") {
        return NextResponse.json(
          { error: "La venta esta anulada" },
          { status: 409 },
        );
      }
      if (error.message === "SALE_BILLED") {
        return NextResponse.json(
          { error: "No se puede editar una venta ya facturada" },
          { status: 409 },
        );
      }
      if (
        error.message === "DAILY_ITEM_NOT_FOUND" ||
        error.message === "DAILY_RECEIPT_NOT_FOUND"
      ) {
        return NextResponse.json(
          { error: "La venta diaria esta incompleta" },
          { status: 409 },
        );
      }
      if (error.message === "DAILY_ITEM_INVALID") {
        return NextResponse.json(
          { error: "Item de venta diaria invalido" },
          { status: 400 },
        );
      }
      if (error.message === "DAILY_RECEIPT_COMPLEX") {
        return NextResponse.json(
          { error: "Esta venta tiene un cobro complejo y debe corregirse desde cobros" },
          { status: 409 },
        );
      }
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.sales.daily-cash.patch", error);
    return NextResponse.json(
      { error: "No se pudo cerrar caja" },
      { status: 400 },
    );
  }
}
