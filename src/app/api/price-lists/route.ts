import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { PRICE_LIST_ORDER_BY } from "@/lib/price-lists";

const createPriceListSchema = z.object({
  name: z.string().min(2),
  currencyCode: z.string().min(3).max(3).optional(),
  isDefault: z.boolean().optional(),
  isConsumerFinal: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(1).optional(),
});

const updatePriceListSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  currencyCode: z.string().min(3).max(3).optional(),
  isDefault: z.boolean().optional(),
  isConsumerFinal: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(1).optional(),
});

const normalizePriceListSortOrders = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  movedPriceListId?: string,
  requestedSortOrder?: number,
) => {
  const priceLists = await tx.priceList.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
    orderBy: PRICE_LIST_ORDER_BY,
  });

  if (!priceLists.length) return;

  const movedPriceList = movedPriceListId
    ? priceLists.find((priceList) => priceList.id === movedPriceListId)
    : null;
  const otherPriceLists = movedPriceList
    ? priceLists.filter((priceList) => priceList.id !== movedPriceList.id)
    : priceLists;
  const targetIndex = movedPriceList
    ? Math.min(
        Math.max((requestedSortOrder ?? priceLists.length) - 1, 0),
        otherPriceLists.length,
      )
    : null;
  const orderedPriceLists = movedPriceList
    ? [
        ...otherPriceLists.slice(0, targetIndex ?? 0),
        movedPriceList,
        ...otherPriceLists.slice(targetIndex ?? 0),
      ]
    : otherPriceLists;

  await Promise.all(
    orderedPriceLists.map((priceList, index) =>
      tx.priceList.update({
        where: { id: priceList.id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const priceLists = await prisma.priceList.findMany({
      where: { organizationId, isActive: true },
      orderBy: PRICE_LIST_ORDER_BY,
    });

    return NextResponse.json(
      priceLists.map((priceList) => ({
        id: priceList.id,
        name: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        isConsumerFinal: priceList.isConsumerFinal,
        isActive: priceList.isActive,
        sortOrder: priceList.sortOrder,
      })),
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = createPriceListSchema.parse(await req.json());
    const name = body.name.trim();
    const currencyCode = (body.currencyCode?.trim() || "ARS").toUpperCase();
    const isDefault = body.isDefault ?? false;
    const isConsumerFinal = body.isConsumerFinal ?? false;

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.priceList.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }
      if (isConsumerFinal) {
        await tx.priceList.updateMany({
          where: { organizationId, isActive: true, isConsumerFinal: true },
          data: { isConsumerFinal: false },
        });
      }

      const created = await tx.priceList.create({
        data: {
          organizationId,
          name,
          currencyCode,
          isDefault,
          isConsumerFinal,
          isActive: true,
          sortOrder: 0,
        },
      });
      await normalizePriceListSortOrders(
        tx,
        organizationId,
        created.id,
        body.sortOrder,
      );
      return tx.priceList.findUniqueOrThrow({ where: { id: created.id } });
    });

    return NextResponse.json({
      id: created.id,
      name: created.name,
      currencyCode: created.currencyCode,
      isDefault: created.isDefault,
      isConsumerFinal: created.isConsumerFinal,
      isActive: created.isActive,
      sortOrder: created.sortOrder,
    });
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
    logServerError("api.price-lists.post", error);
    return NextResponse.json(
      { error: "No se pudo crear la lista" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = updatePriceListSchema.parse(await req.json());
    const name = body.name.trim();
    const currencyCode = (body.currencyCode?.trim() || "ARS").toUpperCase();
    const isDefault = body.isDefault ?? false;
    const isConsumerFinal = body.isConsumerFinal ?? false;

    const existing = await prisma.priceList.findFirst({
      where: { id: body.id, organizationId, isActive: true },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lista no encontrada" },
        { status: 404 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.priceList.updateMany({
          where: {
            organizationId,
            isActive: true,
            isDefault: true,
            id: { not: body.id },
          },
          data: { isDefault: false },
        });
      }
      if (isConsumerFinal) {
        await tx.priceList.updateMany({
          where: {
            organizationId,
            isActive: true,
            isConsumerFinal: true,
            id: { not: body.id },
          },
          data: { isConsumerFinal: false },
        });
      }

      const updatedPriceList = await tx.priceList.update({
        where: { id: body.id },
        data: {
          name,
          currencyCode,
          isDefault,
          isConsumerFinal,
        },
      });
      if (body.sortOrder !== undefined) {
        await normalizePriceListSortOrders(
          tx,
          organizationId,
          body.id,
          body.sortOrder,
        );
        return tx.priceList.findUniqueOrThrow({ where: { id: body.id } });
      }
      return updatedPriceList;
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      currencyCode: updated.currencyCode,
      isDefault: updated.isDefault,
      isConsumerFinal: updated.isConsumerFinal,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
    });
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
    logServerError("api.price-lists.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la lista" },
      { status: 400 },
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

    const existing = await prisma.priceList.findFirst({
      where: { id, organizationId, isActive: true },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lista no encontrada" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.priceList.update({
        where: { id },
        data: {
          isActive: false,
          isDefault: false,
        },
      });

      await tx.customer.updateMany({
        where: { organizationId, defaultPriceListId: id },
        data: { defaultPriceListId: null },
      });

      await normalizePriceListSortOrders(tx, organizationId);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.price-lists.delete", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la lista" },
      { status: 400 },
    );
  }
}
