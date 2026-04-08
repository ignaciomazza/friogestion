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

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const products = await prisma.product.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        cost: product.cost?.toString() ?? null,
        price: product.price?.toString() ?? null,
        isActive: product.isActive,
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
