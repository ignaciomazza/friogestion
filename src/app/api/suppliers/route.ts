import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const supplierSchema = z.object({
  displayName: z.string().min(2),
  legalName: z.string().min(2).optional(),
  taxId: z.string().min(6).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  address: z.string().min(3).optional(),
});

const supplierUpdateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(2),
  legalName: z.string().min(2).optional(),
  taxId: z.string().min(6).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).optional(),
  address: z.string().min(3).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      suppliers.map((supplier) => ({
        id: supplier.id,
        displayName: supplier.displayName,
        legalName: supplier.legalName,
        taxId: supplier.taxId,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        arcaVerificationStatus: supplier.arcaVerificationStatus,
        arcaVerificationCheckedAt:
          supplier.arcaVerificationCheckedAt?.toISOString() ?? null,
        arcaVerificationMessage: supplier.arcaVerificationMessage ?? null,
        arcaVerificationSnapshot: supplier.arcaVerificationSnapshot ?? null,
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
    const body = supplierSchema.parse(await req.json());

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        displayName: body.displayName.trim(),
        legalName: body.legalName?.trim() || undefined,
        taxId: body.taxId?.trim() || undefined,
        email: body.email?.trim() || undefined,
        phone: body.phone?.trim() || undefined,
        address: body.address?.trim() || undefined,
      },
    });

    return NextResponse.json({
      id: supplier.id,
      displayName: supplier.displayName,
      legalName: supplier.legalName,
      taxId: supplier.taxId,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      arcaVerificationStatus: supplier.arcaVerificationStatus,
      arcaVerificationCheckedAt:
        supplier.arcaVerificationCheckedAt?.toISOString() ?? null,
      arcaVerificationMessage: supplier.arcaVerificationMessage ?? null,
      arcaVerificationSnapshot: supplier.arcaVerificationSnapshot ?? null,
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
    logServerError("api.suppliers.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = supplierUpdateSchema.parse(await req.json());

    const existing = await prisma.supplier.findFirst({
      where: { id: body.id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const supplier = await prisma.supplier.update({
      where: { id: body.id },
      data: {
        displayName: body.displayName.trim(),
        legalName: body.legalName?.trim() || undefined,
        taxId: body.taxId?.trim() || undefined,
        email: body.email?.trim() || undefined,
        phone: body.phone?.trim() || undefined,
        address: body.address?.trim() || undefined,
      },
    });

    return NextResponse.json({
      id: supplier.id,
      displayName: supplier.displayName,
      legalName: supplier.legalName,
      taxId: supplier.taxId,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      arcaVerificationStatus: supplier.arcaVerificationStatus,
      arcaVerificationCheckedAt:
        supplier.arcaVerificationCheckedAt?.toISOString() ?? null,
      arcaVerificationMessage: supplier.arcaVerificationMessage ?? null,
      arcaVerificationSnapshot: supplier.arcaVerificationSnapshot ?? null,
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
    logServerError("api.suppliers.patch", error);
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

    const existing = await prisma.supplier.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    await prisma.supplier.delete({ where: { id } });
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
        { error: "Proveedor con movimientos asociados" },
        { status: 409 }
      );
    }
    logServerError("api.suppliers.delete", error);
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
