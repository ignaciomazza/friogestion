import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { aggregateStockByProduct } from "@/lib/stock-balance";

const stockPatchSchema = z.object({
  productId: z.string().min(1),
  cost: z.union([z.coerce.number().min(0), z.null()]).optional(),
  priceListId: z.string().min(1).optional(),
  price: z.union([z.coerce.number().min(0), z.null()]).optional(),
  prices: z
    .array(
      z.object({
        priceListId: z.string().min(1),
        price: z.union([z.coerce.number().min(0), z.null()]),
      }),
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const [products, priceLists, priceItems, movements] = await Promise.all([
      prisma.product.findMany({
        where: { organizationId },
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      }),
      prisma.priceList.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.priceListItem.findMany({
        where: {
          priceList: {
            organizationId,
            isActive: true,
          },
        },
        select: {
          productId: true,
          priceListId: true,
          price: true,
        },
      }),
      prisma.stockMovement.findMany({
        where: { organizationId },
        select: { productId: true, type: true, qty: true },
      }),
    ]);

    const stockByProduct = aggregateStockByProduct(movements);
    const pricesByProduct = new Map<
      string,
      Array<{ priceListId: string; price: string }>
    >();

    for (const item of priceItems) {
      const current = pricesByProduct.get(item.productId) ?? [];
      current.push({
        priceListId: item.priceListId,
        price: item.price.toString(),
      });
      pricesByProduct.set(item.productId, current);
    }

    return NextResponse.json({
      priceLists: priceLists.map((priceList) => ({
        id: priceList.id,
        name: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        isActive: priceList.isActive,
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        cost: product.cost?.toString() ?? null,
        price: product.price?.toString() ?? null,
        stock: (stockByProduct.get(product.id) ?? 0).toFixed(3),
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

    const normalizedPriceUpdates = new Map<string, number | null>();
    if (body.price !== undefined) {
      if (!body.priceListId) {
        return NextResponse.json(
          { error: "Falta lista de precios" },
          { status: 400 },
        );
      }
      normalizedPriceUpdates.set(body.priceListId, body.price);
    }
    for (const priceUpdate of body.prices ?? []) {
      normalizedPriceUpdates.set(priceUpdate.priceListId, priceUpdate.price);
    }

    if (body.cost === undefined && normalizedPriceUpdates.size === 0) {
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
      if (body.cost !== undefined) {
        await tx.product.update({
          where: { id: body.productId },
          data: {
            cost: body.cost === null ? null : body.cost.toFixed(2),
          },
        });
      }

      for (const [priceListId, nextPrice] of normalizedPriceUpdates.entries()) {
        const priceList = priceListById.get(priceListId);
        if (!priceList) {
          // Defensive guard in case list changes after validation.
          continue;
        }

        if (nextPrice === null) {
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
            update: { price: nextPrice.toFixed(2) },
            create: {
              priceListId,
              productId: body.productId,
              price: nextPrice.toFixed(2),
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
    logServerError("api.stock.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar stock/precio" },
      { status: 400 },
    );
  }
}
