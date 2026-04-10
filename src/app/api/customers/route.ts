import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const customerSchema = z.object({
  displayName: z.string().min(2),
  defaultPriceListId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  taxId: z.string().min(6).optional(),
  address: z.string().min(3).optional(),
});

const customerUpdateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(2),
  defaultPriceListId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  taxId: z.string().min(6).optional(),
  address: z.string().min(3).optional(),
});

const normalizeDefaultPriceListId = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed || null;
};

const ensureDefaultPriceList = async (
  organizationId: string,
  defaultPriceListId: string | null,
) => {
  if (!defaultPriceListId) return null;

  const priceList = await prisma.priceList.findFirst({
    where: { id: defaultPriceListId, organizationId, isActive: true },
    select: {
      id: true,
      isConsumerFinal: true,
    },
  });

  if (!priceList) {
    throw new Error("PRICE_LIST_INVALID");
  }

  return priceList;
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const customers = await prisma.customer.findMany({
      where: { organizationId, systemKey: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      customers.map((customer) => ({
        id: customer.id,
        displayName: customer.displayName,
        legalName: customer.legalName,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        type: customer.type,
        systemKey: customer.systemKey,
        defaultPriceListId: customer.defaultPriceListId,
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
    const body = customerSchema.parse(await req.json());
    const defaultPriceList = await ensureDefaultPriceList(
      organizationId,
      normalizeDefaultPriceListId(body.defaultPriceListId),
    );
    const inferredType = defaultPriceList?.isConsumerFinal
      ? "CONSUMER_FINAL"
      : "BUSINESS";

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        displayName: body.displayName.trim(),
        type: inferredType,
        defaultPriceListId: defaultPriceList?.id ?? undefined,
        email: body.email?.trim() || undefined,
        phone: body.phone?.trim() || undefined,
        taxId: body.taxId?.trim() || undefined,
        address: body.address?.trim() || undefined,
      },
    });

    return NextResponse.json({
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      taxId: customer.taxId,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      type: customer.type,
      systemKey: customer.systemKey,
      defaultPriceListId: customer.defaultPriceListId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PRICE_LIST_INVALID") {
      return NextResponse.json(
        { error: "Lista de precios invalida" },
        { status: 400 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.customers.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = customerUpdateSchema.parse(await req.json());
    let nextType: "CONSUMER_FINAL" | "BUSINESS" | undefined = undefined;
    let defaultPriceListId: string | null | undefined = undefined;
    if (body.defaultPriceListId !== undefined) {
      const defaultPriceList = await ensureDefaultPriceList(
        organizationId,
        normalizeDefaultPriceListId(body.defaultPriceListId),
      );
      defaultPriceListId = defaultPriceList?.id ?? null;
      if (defaultPriceList) {
        nextType = defaultPriceList.isConsumerFinal
          ? "CONSUMER_FINAL"
          : "BUSINESS";
      }
    }

    const existing = await prisma.customer.findFirst({
      where: { id: body.id, organizationId },
      select: {
        id: true,
        type: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const customer = await prisma.customer.update({
      where: { id: body.id },
      data: {
        displayName: body.displayName.trim(),
        type: nextType ?? existing.type,
        ...(defaultPriceListId !== undefined
          ? { defaultPriceListId }
          : {}),
        email: body.email?.trim() || undefined,
        phone: body.phone?.trim() || undefined,
        taxId: body.taxId?.trim() || undefined,
        address: body.address?.trim() || undefined,
      },
    });

    return NextResponse.json({
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      taxId: customer.taxId,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      type: customer.type,
      systemKey: customer.systemKey,
      defaultPriceListId: customer.defaultPriceListId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PRICE_LIST_INVALID") {
      return NextResponse.json(
        { error: "Lista de precios invalida" },
        { status: 400 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.customers.patch", error);
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

    const existing = await prisma.customer.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    await prisma.customer.delete({ where: { id } });
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
        { error: "Cliente con movimientos asociados" },
        { status: 409 }
      );
    }
    logServerError("api.customers.delete", error);
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
