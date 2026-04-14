import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_VALUES,
  type CustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";

const customerSchema = z.object({
  displayName: z.string().min(2),
  defaultPriceListId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  taxId: z.string().min(6).optional(),
  address: z.string().min(3).optional(),
  fiscalTaxProfile: z.enum(CUSTOMER_FISCAL_TAX_PROFILE_VALUES).optional(),
});

const customerUpdateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(2),
  defaultPriceListId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  taxId: z.string().min(6).optional(),
  address: z.string().min(3).optional(),
  fiscalTaxProfile: z.enum(CUSTOMER_FISCAL_TAX_PROFILE_VALUES).optional(),
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

const inferFiscalTaxProfileFromCustomerType = (
  type: "CONSUMER_FINAL" | "BUSINESS"
): CustomerFiscalTaxProfile =>
  type === "CONSUMER_FINAL" ? "CONSUMIDOR_FINAL" : "MONOTRIBUTISTA";

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

    const where: Prisma.CustomerWhereInput = {
      organizationId,
      systemKey: null,
      ...(query
        ? {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { taxId: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CustomerOrderByWithRelationInput[] = [
      { displayName: sort === "za" ? "desc" : "asc" },
      { createdAt: "desc" },
    ];

    const [total, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      }),
    ]);

    const nextOffset = offset + customers.length;
    const hasMore = nextOffset < total;

    return NextResponse.json({
      items: customers.map((customer) => ({
        id: customer.id,
        displayName: customer.displayName,
        legalName: customer.legalName,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        type: customer.type,
        fiscalTaxProfile: customer.fiscalTaxProfile,
        systemKey: customer.systemKey,
        defaultPriceListId: customer.defaultPriceListId,
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
    const body = customerSchema.parse(await req.json());
    const defaultPriceList = await ensureDefaultPriceList(
      organizationId,
      normalizeDefaultPriceListId(body.defaultPriceListId),
    );
    const inferredType = defaultPriceList?.isConsumerFinal
      ? "CONSUMER_FINAL"
      : "BUSINESS";
    const fiscalTaxProfile =
      body.fiscalTaxProfile ??
      inferFiscalTaxProfileFromCustomerType(inferredType);

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        displayName: body.displayName.trim(),
        type: inferredType,
        fiscalTaxProfile,
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
      fiscalTaxProfile: customer.fiscalTaxProfile,
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
    let nextFiscalTaxProfile: CustomerFiscalTaxProfile | undefined = undefined;
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
        nextFiscalTaxProfile = inferFiscalTaxProfileFromCustomerType(nextType);
      }
    }
    if (body.fiscalTaxProfile !== undefined) {
      nextFiscalTaxProfile = body.fiscalTaxProfile;
    }

    const existing = await prisma.customer.findFirst({
      where: { id: body.id, organizationId },
      select: {
        id: true,
        type: true,
        fiscalTaxProfile: true,
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
        fiscalTaxProfile: nextFiscalTaxProfile ?? existing.fiscalTaxProfile,
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
      fiscalTaxProfile: customer.fiscalTaxProfile,
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
