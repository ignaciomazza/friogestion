import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";

const createPriceListSchema = z.object({
  name: z.string().min(2),
  currencyCode: z.string().min(3).max(3).optional(),
  isDefault: z.boolean().optional(),
});

const updatePriceListSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  currencyCode: z.string().min(3).max(3).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const priceLists = await prisma.priceList.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(
      priceLists.map((priceList) => ({
        id: priceList.id,
        name: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        isActive: priceList.isActive,
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

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.priceList.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.priceList.create({
        data: {
          organizationId,
          name,
          currencyCode,
          isDefault,
          isActive: true,
        },
      });
    });

    return NextResponse.json({
      id: created.id,
      name: created.name,
      currencyCode: created.currencyCode,
      isDefault: created.isDefault,
      isActive: created.isActive,
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

      return tx.priceList.update({
        where: { id: body.id },
        data: {
          name,
          currencyCode,
          isDefault,
        },
      });
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      currencyCode: updated.currencyCode,
      isDefault: updated.isDefault,
      isActive: updated.isActive,
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
