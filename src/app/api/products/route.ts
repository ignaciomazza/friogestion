import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { UNIT_VALUES } from "@/lib/units";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  unit: z.enum(UNIT_VALUES).optional(),
});

const productUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  sku: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  unit: z.enum(UNIT_VALUES).optional(),
});

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const parseLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  const normalized = Math.trunc(parsed);
  if (normalized < 1) return 1;
  if (normalized > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return normalized;
};

const parseOffset = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.trunc(parsed);
  if (normalized < 0) return 0;
  return normalized;
};

const parseSort = (value: string | null) => (value === "za" ? "za" : "az");

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseOffset(req.nextUrl.searchParams.get("offset"));
    const sort = parseSort(req.nextUrl.searchParams.get("sort"));
    const includePrices =
      req.nextUrl.searchParams.get("includePrices") === "1";
    const unitParam = req.nextUrl.searchParams.get("unit")?.trim() ?? "";
    const unit = unitParam && unitParam !== "ALL" ? unitParam : null;

    if (unit && !UNIT_VALUES.includes(unit as (typeof UNIT_VALUES)[number])) {
      return NextResponse.json({ error: "Unidad invalida" }, { status: 400 });
    }

    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
              { brand: { contains: query, mode: "insensitive" } },
              { model: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(unit ? { unit } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { name: sort === "za" ? "desc" : "asc" },
      { createdAt: "desc" },
    ];

    if (includePrices) {
      const [total, products] = await prisma.$transaction([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            priceItems: {
              select: {
                priceListId: true,
                price: true,
                percentage: true,
              },
            },
          },
        }),
      ]);

      const nextOffset = offset + products.length;
      const hasMore = nextOffset < total;

      return NextResponse.json({
        items: products.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          model: product.model,
          unit: product.unit,
          cost: product.cost?.toString() ?? null,
          costUsd: product.costUsd?.toString() ?? null,
          price: product.price?.toString() ?? null,
          isActive: product.isActive,
          prices: product.priceItems.map((priceItem) => ({
            priceListId: priceItem.priceListId,
            price: priceItem.price.toString(),
            percentage: priceItem.percentage?.toString() ?? null,
          })),
        })),
        total,
        nextOffset: hasMore ? nextOffset : null,
        hasMore,
      });
    }

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      }),
    ]);

    const nextOffset = offset + products.length;
    const hasMore = nextOffset < total;

    return NextResponse.json({
      items: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        cost: product.cost?.toString() ?? null,
        costUsd: product.costUsd?.toString() ?? null,
        price: product.price?.toString() ?? null,
        isActive: product.isActive,
      })),
      total,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = productSchema.parse(await req.json());

    const sku = body.sku?.trim();
    const brand = body.brand?.trim();
    const model = body.model?.trim();
    const unit = body.unit?.trim();

    const product = await prisma.product.create({
      data: {
        organizationId,
        name: body.name.trim(),
        sku: sku || undefined,
        brand: brand || undefined,
        model: model || undefined,
        unit: unit || undefined,
      },
    });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      model: product.model,
      unit: product.unit,
      cost: product.cost?.toString() ?? null,
      costUsd: product.costUsd?.toString() ?? null,
      price: product.price?.toString() ?? null,
      isActive: product.isActive,
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Codigo duplicado en esta organizacion" },
        { status: 409 }
      );
    }
    logServerError("api.products.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = productUpdateSchema.parse(await req.json());

    const existing = await prisma.product.findFirst({
      where: { id: body.id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const sku = body.sku?.trim();
    const brand = body.brand?.trim();
    const model = body.model?.trim();
    const unit = body.unit?.trim();

    const product = await prisma.product.update({
      where: { id: body.id },
      data: {
        name: body.name.trim(),
        sku: sku || undefined,
        brand: brand || undefined,
        model: model || undefined,
        unit: unit || undefined,
      },
    });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      model: product.model,
      unit: product.unit,
      cost: product.cost?.toString() ?? null,
      costUsd: product.costUsd?.toString() ?? null,
      price: product.price?.toString() ?? null,
      isActive: product.isActive,
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Codigo duplicado en esta organizacion" },
        { status: 409 }
      );
    }
    logServerError("api.products.patch", error);
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 400 });
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

    const existing = await prisma.product.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    await prisma.product.delete({ where: { id } });
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
        { error: "Producto con movimientos asociados" },
        { status: 409 }
      );
    }
    logServerError("api.products.delete", error);
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
