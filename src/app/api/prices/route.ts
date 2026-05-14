import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { aggregateStockByProduct } from "@/lib/stock-balance";
import { STOCK_ENABLED } from "@/lib/features";
import { normalizeStockSort, type StockSort } from "@/lib/stock-sort";
import { PRICE_LIST_ORDER_BY } from "@/lib/price-lists";
import {
  normalizeSearchText,
  rankProductsBySearchQuery,
} from "@/lib/products-search";

const DEFAULT_STOCK_PAGE_SIZE = 60;
const MAX_STOCK_PAGE_SIZE = 200;

const stockPatchSchema = z.object({
  productId: z.string().min(1),
  cost: z.union([z.coerce.number().min(0), z.null()]).optional(),
  costUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
  priceListId: z.string().min(1).optional(),
  price: z.union([z.coerce.number().min(0), z.null()]).optional(),
  percentage: z.union([z.coerce.number(), z.null()]).optional(),
  prices: z
    .array(
      z.object({
        priceListId: z.string().min(1),
        price: z.union([z.coerce.number().min(0), z.null()]),
        percentage: z.union([z.coerce.number(), z.null()]).optional(),
      }),
    )
    .optional(),
});

const productOrderBy = (
  sort: StockSort,
): Prisma.ProductOrderByWithRelationInput[] => {
  if (sort === "created-asc") {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }
  if (sort === "code-asc") {
    return [
      { sku: { sort: "asc", nulls: "last" } },
      { name: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  }
  if (sort === "code-desc") {
    return [
      { sku: { sort: "desc", nulls: "last" } },
      { name: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  }
  if (sort === "name-asc") {
    return [{ name: "asc" }, { createdAt: "desc" }, { id: "asc" }];
  }
  if (sort === "name-desc") {
    return [{ name: "desc" }, { createdAt: "desc" }, { id: "asc" }];
  }
  if (sort === "brand-asc") {
    return [
      { brand: { sort: "asc", nulls: "last" } },
      { name: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  }
  if (sort === "brand-desc") {
    return [
      { brand: { sort: "desc", nulls: "last" } },
      { name: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  }

  return [{ createdAt: "desc" }, { id: "asc" }];
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const sort = normalizeStockSort(req.nextUrl.searchParams.get("sort"));
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? "");
    const requestedOffset = Number(req.nextUrl.searchParams.get("offset") ?? "");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_STOCK_PAGE_SIZE)
      : DEFAULT_STOCK_PAGE_SIZE;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(Math.trunc(requestedOffset), 0)
      : 0;

    const normalizedQuery = normalizeSearchText(query);
    const productWhere: Prisma.ProductWhereInput = { organizationId };

    let total = 0;
    let products: Awaited<ReturnType<typeof prisma.product.findMany>> = [];

    if (normalizedQuery) {
      const allProducts = await prisma.product.findMany({
        where: productWhere,
        orderBy: productOrderBy(sort),
      });
      const rankedProducts = rankProductsBySearchQuery(allProducts, query);
      total = rankedProducts.length;
      products = rankedProducts.slice(offset, offset + limit);
    } else {
      const [count, pagedProducts] = await Promise.all([
        prisma.product.count({ where: productWhere }),
        prisma.product.findMany({
          where: productWhere,
          orderBy: productOrderBy(sort),
          skip: offset,
          take: limit,
        }),
      ]);
      total = count;
      products = pagedProducts;
    }

    const [priceLists, latestUsdRate] = await Promise.all([
      prisma.priceList.findMany({
        where: { organizationId, isActive: true },
        orderBy: PRICE_LIST_ORDER_BY,
      }),
      prisma.exchangeRate.findFirst({
        where: {
          organizationId,
          baseCode: "USD",
          quoteCode: "ARS",
        },
        orderBy: { asOf: "desc" },
      }),
    ]);
    const productIds = products.map((product) => product.id);
    const [priceItems, movements] = await Promise.all([
      productIds.length
        ? prisma.priceListItem.findMany({
            where: {
              productId: { in: productIds },
              priceList: {
                organizationId,
                isActive: true,
              },
            },
            select: {
              productId: true,
              priceListId: true,
              price: true,
              percentage: true,
            },
          })
        : Promise.resolve([]),
      STOCK_ENABLED && productIds.length
        ? prisma.stockMovement.findMany({
            where: { organizationId, productId: { in: productIds } },
            select: { productId: true, type: true, qty: true },
          })
        : Promise.resolve([]),
    ]);

    const stockByProduct = STOCK_ENABLED
      ? aggregateStockByProduct(movements)
      : new Map<string, number>();
    const pricesByProduct = new Map<
      string,
      Array<{
        priceListId: string;
        price: string | null;
        percentage: string | null;
      }>
    >();

    for (const item of priceItems) {
      const current = pricesByProduct.get(item.productId) ?? [];
      current.push({
        priceListId: item.priceListId,
        price: item.price?.toString() ?? null,
        percentage: item.percentage?.toString() ?? null,
      });
      pricesByProduct.set(item.productId, current);
    }

    const hasMore = offset + products.length < total;

    return NextResponse.json({
      total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + products.length : null,
      latestUsdRate: latestUsdRate?.rate?.toString() ?? null,
      priceLists: priceLists.map((priceList) => ({
        id: priceList.id,
        name: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        isActive: priceList.isActive,
        sortOrder: priceList.sortOrder,
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        purchaseCode: product.purchaseCode,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        cost: product.cost?.toString() ?? null,
        costUsd: product.costUsd?.toString() ?? null,
        price: product.price?.toString() ?? null,
        stock: STOCK_ENABLED
          ? (stockByProduct.get(product.id) ?? 0).toFixed(3)
          : "0.000",
        prices: pricesByProduct.get(product.id) ?? [],
      })),
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = stockPatchSchema.parse(await req.json());

    const normalizedPriceUpdates = new Map<
      string,
      { price: number | null; percentage?: number | null }
    >();
    if (body.price !== undefined) {
      if (!body.priceListId) {
        return NextResponse.json(
          { error: "Falta lista de precios" },
          { status: 400 },
        );
      }
      normalizedPriceUpdates.set(body.priceListId, {
        price: body.price,
        ...(body.percentage !== undefined ? { percentage: body.percentage } : {}),
      });
    }
    for (const priceUpdate of body.prices ?? []) {
      normalizedPriceUpdates.set(priceUpdate.priceListId, {
        price: priceUpdate.price,
        ...(priceUpdate.percentage !== undefined
          ? { percentage: priceUpdate.percentage }
          : {}),
      });
    }

    if (
      body.cost === undefined &&
      body.costUsd === undefined &&
      normalizedPriceUpdates.size === 0
    ) {
      return NextResponse.json(
        { error: "Nada para actualizar" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findFirst({
      where: { id: body.productId, organizationId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const priceListIds = Array.from(normalizedPriceUpdates.keys());
    const priceLists = priceListIds.length
      ? await prisma.priceList.findMany({
          where: {
            organizationId,
            isActive: true,
            id: { in: priceListIds },
          },
          select: { id: true, isDefault: true },
        })
      : [];

    if (priceLists.length !== priceListIds.length) {
      return NextResponse.json(
        { error: "Lista de precios invalida" },
        { status: 400 },
      );
    }

    const priceListById = new Map(
      priceLists.map((priceList) => [priceList.id, priceList]),
    );

    await prisma.$transaction(async (tx) => {
      if (body.cost !== undefined || body.costUsd !== undefined) {
        await tx.product.update({
          where: { id: body.productId },
          data: {
            ...(body.cost !== undefined
              ? { cost: body.cost === null ? null : body.cost.toFixed(2) }
              : {}),
            ...(body.costUsd !== undefined
              ? { costUsd: body.costUsd === null ? null : body.costUsd.toFixed(2) }
              : {}),
          },
        });
      }

      for (const [priceListId, update] of normalizedPriceUpdates.entries()) {
        const priceList = priceListById.get(priceListId);
        if (!priceList) {
          // Defensive guard in case list changes after validation.
          continue;
        }

        const nextPrice = update.price;
        const nextPercentage = update.percentage;
        const shouldDeletePriceItem =
          nextPrice === null &&
          (nextPercentage === undefined || nextPercentage === null);
        if (shouldDeletePriceItem) {
          await tx.priceListItem.deleteMany({
            where: {
              productId: body.productId,
              priceListId,
            },
          });
        } else {
          await tx.priceListItem.upsert({
            where: {
              priceListId_productId: {
                priceListId,
                productId: body.productId,
              },
            },
            update: {
              price: nextPrice === null ? null : nextPrice.toFixed(2),
              ...(nextPercentage !== undefined
                ? {
                    percentage:
                      nextPercentage === null ? null : nextPercentage.toFixed(4),
                  }
                : {}),
            },
            create: {
              priceListId,
              productId: body.productId,
              price: nextPrice === null ? null : nextPrice.toFixed(2),
              ...(nextPercentage !== undefined
                ? {
                    percentage:
                      nextPercentage === null ? null : nextPercentage.toFixed(4),
                  }
                : {}),
            },
          });
        }

        if (priceList.isDefault) {
          await tx.product.update({
            where: { id: body.productId },
            data: {
              price: nextPrice === null ? null : nextPrice.toFixed(2),
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.prices.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar precio" },
      { status: 400 },
    );
  }
}
