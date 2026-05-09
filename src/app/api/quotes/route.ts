import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import {
  EXTRA_CHARGE_TYPES,
  calculateSaleAdjustment,
  type ExtraChargeTypeValue,
} from "@/lib/sale-adjustments";

const quoteItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).max(100),
});

const quoteSchema = z.object({
  customerId: z.string().min(1),
  priceListId: z.string().min(1).optional(),
  quoteNumber: z.string().min(1).optional(),
  validUntil: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).optional(),
  extraType: z.enum(EXTRA_CHARGE_TYPES).optional(),
  extraValue: z.coerce.number().min(0).optional(),
  items: z.array(quoteItemSchema).min(1),
});

const quoteUpdateSchema = quoteSchema.extend({
  id: z.string().min(1),
});

const findActivePriceListId = async (
  organizationId: string,
  priceListId?: string | null,
) => {
  if (!priceListId) return null;
  const normalized = priceListId.trim();
  if (!normalized) return null;
  const priceList = await prisma.priceList.findFirst({
    where: { id: normalized, organizationId, isActive: true },
    select: { id: true },
  });
  return priceList?.id ?? null;
};

const resolveQuotePriceListId = async ({
  organizationId,
  requestedPriceListId,
  customerDefaultPriceListId,
  existingPriceListId,
}: {
  organizationId: string;
  requestedPriceListId?: string | null;
  customerDefaultPriceListId?: string | null;
  existingPriceListId?: string | null;
}) => {
  const requestedId = requestedPriceListId?.trim() || null;
  if (requestedId) {
    const explicit = await findActivePriceListId(organizationId, requestedId);
    if (!explicit) {
      throw new Error("PRICE_LIST_INVALID");
    }
    return explicit;
  }

  for (const candidate of [customerDefaultPriceListId, existingPriceListId]) {
    const resolved = await findActivePriceListId(organizationId, candidate);
    if (resolved) return resolved;
  }

  const fallback = await prisma.priceList.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [
      { isDefault: "desc" },
      { isConsumerFinal: "desc" },
      { name: "asc" },
    ],
    select: { id: true },
  });

  return fallback?.id ?? null;
};

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
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      const quote = await prisma.quote.findFirst({
        where: { id, organizationId },
        include: {
          customer: true,
          priceList: true,
          items: {
            include: {
              product: {
                include: { priceItems: true },
              },
            },
          },
          sale: true,
        },
      });

      if (!quote) {
        return NextResponse.json(
          { error: "Presupuesto no encontrado" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: quote.id,
        customerName: quote.customer.displayName,
        customerPhone: quote.customer.phone,
        quoteNumber: quote.quoteNumber,
        validUntil: quote.validUntil?.toISOString() ?? null,
        createdAt: quote.createdAt.toISOString(),
        subtotal: quote.subtotal?.toString() ?? null,
        taxes: quote.taxes?.toString() ?? null,
        extraType: quote.extraType ?? null,
        extraValue: quote.extraValue?.toString() ?? null,
        extraAmount: quote.extraAmount?.toString() ?? null,
        total: quote.total?.toString() ?? null,
        status: quote.status,
        saleId: quote.sale?.id ?? null,
        priceListId: quote.priceListId ?? null,
        priceList: quote.priceList
          ? {
              id: quote.priceList.id,
              name: quote.priceList.name,
              currencyCode: quote.priceList.currencyCode,
              isDefault: quote.priceList.isDefault,
              isConsumerFinal: quote.priceList.isConsumerFinal,
            }
          : null,
        customer: {
          id: quote.customer.id,
          displayName: quote.customer.displayName,
          legalName: quote.customer.legalName,
          taxId: quote.customer.taxId,
          email: quote.customer.email,
          phone: quote.customer.phone,
          address: quote.customer.address,
          type: quote.customer.type,
          systemKey: quote.customer.systemKey,
          defaultPriceListId: quote.customer.defaultPriceListId,
        },
        items: quote.items.map((item) => ({
          productId: item.productId,
          qty: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          taxRate: item.taxRate?.toString() ?? "21",
          product: {
            id: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            purchaseCode: item.product.purchaseCode,
            brand: item.product.brand,
            model: item.product.model,
            unit: item.product.unit,
            cost: item.product.cost?.toString() ?? null,
            costUsd: item.product.costUsd?.toString() ?? null,
            price: item.product.price?.toString() ?? null,
            prices: item.product.priceItems.map((priceItem) => ({
              priceListId: priceItem.priceListId,
              price: priceItem.price.toString(),
              percentage: priceItem.percentage?.toString() ?? null,
            })),
          },
        })),
      });
    }

    const quotes = await prisma.quote.findMany({
      where: { organizationId },
      include: { customer: true, sale: true, priceList: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      quotes.map((quote) => ({
        id: quote.id,
        customerName: quote.customer.displayName,
        customerPhone: quote.customer.phone,
        quoteNumber: quote.quoteNumber,
        validUntil: quote.validUntil?.toISOString() ?? null,
        createdAt: quote.createdAt.toISOString(),
        subtotal: quote.subtotal?.toString() ?? null,
        taxes: quote.taxes?.toString() ?? null,
        total: quote.total?.toString() ?? null,
        status: quote.status,
        saleId: quote.sale?.id ?? null,
        priceListId: quote.priceListId ?? null,
        priceListName: quote.priceList?.name ?? null,
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
    const body = quoteSchema.parse(await req.json());

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, organizationId },
      select: {
        id: true,
        defaultPriceListId: true,
      },
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

    const priceListId = await resolveQuotePriceListId({
      organizationId,
      requestedPriceListId: body.priceListId,
      customerDefaultPriceListId: customer.defaultPriceListId,
    });

    const { subtotal, taxes, extraAmount, total } = calculateTotals(
      body.items,
      body.extraType,
      body.extraValue
    );

    const quoteNumberInput = body.quoteNumber?.trim() || undefined;
    const validUntilResult = parseOptionalDate(body.validUntil);
    if (validUntilResult.error) {
      return NextResponse.json(
        { error: "Fecha de validez invalida" },
        { status: 400 }
      );
    }
    const validUntil = validUntilResult.date ?? undefined;
    const status = body.status ?? "DRAFT";

    const quote = await prisma.$transaction(async (tx) => {
      let quoteNumber = quoteNumberInput;
      if (!quoteNumber) {
        const nextValue = await reserveNextCounter(
          tx,
          organizationId,
          "quote-number",
          async () => {
            const lastQuote = await tx.quote.findFirst({
              where: { organizationId, quoteNumber: { not: null } },
              orderBy: { createdAt: "desc" },
              select: { quoteNumber: true },
            });
            return parseSequenceNumber(lastQuote?.quoteNumber);
          }
        );
        quoteNumber = nextValue.toString();
      } else {
        const manualValue = parseSequenceNumber(quoteNumber);
        if (manualValue !== null) {
          await ensureCounterAtLeast(
            tx,
            organizationId,
            "quote-number",
            manualValue
          );
        }
      }

      return tx.quote.create({
        data: {
          organizationId,
          customerId: body.customerId,
          priceListId: priceListId ?? undefined,
          status,
          quoteNumber,
          validUntil,
          subtotal: subtotal.toFixed(2),
          taxes: taxes ? taxes.toFixed(2) : undefined,
          extraType: body.extraType ?? undefined,
          extraValue:
            body.extraValue !== undefined
              ? body.extraValue.toFixed(2)
              : undefined,
          extraAmount: extraAmount ? extraAmount.toFixed(2) : undefined,
          total: total.toFixed(2),
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
        include: { customer: true, priceList: true },
      });
    });

    return NextResponse.json({
      id: quote.id,
      customerName: quote.customer.displayName,
      customerPhone: quote.customer.phone,
      quoteNumber: quote.quoteNumber,
      validUntil: quote.validUntil?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
      subtotal: quote.subtotal?.toString() ?? null,
      taxes: quote.taxes?.toString() ?? null,
      extraType: quote.extraType ?? null,
      extraValue: quote.extraValue?.toString() ?? null,
      extraAmount: quote.extraAmount?.toString() ?? null,
      total: quote.total?.toString() ?? null,
      status: quote.status,
      priceListId: quote.priceListId ?? null,
      priceListName: quote.priceList?.name ?? null,
      saleId: null,
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
    if (error instanceof Error && error.message === "PRICE_LIST_INVALID") {
      return NextResponse.json(
        { error: "Lista de precios invalida" },
        { status: 400 },
      );
    }
    logServerError("api.quotes.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = quoteUpdateSchema.parse(await req.json());

    const existing = await prisma.quote.findFirst({
      where: { id: body.id, organizationId },
      include: { sale: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Presupuesto no encontrado" },
        { status: 404 }
      );
    }

    if (existing.sale) {
      return NextResponse.json(
        { error: "Presupuesto ya confirmado" },
        { status: 409 }
      );
    }

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, organizationId },
      select: {
        id: true,
        defaultPriceListId: true,
      },
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

    const priceListId = await resolveQuotePriceListId({
      organizationId,
      requestedPriceListId: body.priceListId,
      customerDefaultPriceListId: customer.defaultPriceListId,
      existingPriceListId: existing.priceListId,
    });

    const { subtotal, taxes, extraAmount, total } = calculateTotals(
      body.items,
      body.extraType,
      body.extraValue
    );

    const quoteNumberInput = body.quoteNumber?.trim() || undefined;
    const validUntilResult = parseOptionalDate(body.validUntil);
    if (validUntilResult.error) {
      return NextResponse.json(
        { error: "Fecha de validez invalida" },
        { status: 400 }
      );
    }
    const validUntil = validUntilResult.date ?? undefined;
    const status = body.status ?? "DRAFT";

    const quote = await prisma.$transaction(async (tx) => {
      if (quoteNumberInput) {
        const manualValue = parseSequenceNumber(quoteNumberInput);
        if (manualValue !== null) {
          await ensureCounterAtLeast(
            tx,
            organizationId,
            "quote-number",
            manualValue
          );
        }
      }

      await tx.quoteItem.deleteMany({ where: { quoteId: body.id } });
      return tx.quote.update({
        where: { id: body.id },
        data: {
          customerId: body.customerId,
          priceListId: priceListId ?? undefined,
          status,
          quoteNumber: quoteNumberInput ?? existing.quoteNumber ?? undefined,
          validUntil,
          subtotal: subtotal.toFixed(2),
          taxes: taxes ? taxes.toFixed(2) : undefined,
          extraType: body.extraType ?? undefined,
          extraValue:
            body.extraValue !== undefined
              ? body.extraValue.toFixed(2)
              : undefined,
          extraAmount: extraAmount ? extraAmount.toFixed(2) : undefined,
          total: total.toFixed(2),
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
        include: { customer: true, priceList: true },
      });
    });

    return NextResponse.json({
      id: quote.id,
      customerName: quote.customer.displayName,
      customerPhone: quote.customer.phone,
      quoteNumber: quote.quoteNumber,
      validUntil: quote.validUntil?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
      subtotal: quote.subtotal?.toString() ?? null,
      taxes: quote.taxes?.toString() ?? null,
      extraType: quote.extraType ?? null,
      extraValue: quote.extraValue?.toString() ?? null,
      extraAmount: quote.extraAmount?.toString() ?? null,
      total: quote.total?.toString() ?? null,
      status: quote.status,
      priceListId: quote.priceListId ?? null,
      priceListName: quote.priceList?.name ?? null,
      saleId: null,
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
    if (error instanceof Error && error.message === "PRICE_LIST_INVALID") {
      return NextResponse.json(
        { error: "Lista de precios invalida" },
        { status: 400 },
      );
    }
    logServerError("api.quotes.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const existing = await prisma.quote.findFirst({
      where: { id, organizationId },
      include: { sale: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Presupuesto no encontrado" },
        { status: 404 }
      );
    }

    if (existing.sale) {
      return NextResponse.json(
        { error: "Presupuesto ya confirmado" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.quoteItem.deleteMany({
        where: { quoteId: id },
      });
      await tx.quote.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.quotes.delete", error);
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
