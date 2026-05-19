import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";

const methodSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["CASH", "TRANSFER", "CARD", "CHECK", "OTHER"]),
  requiresAccount: z.boolean(),
  isActive: z.boolean().optional(),
});

const methodUpdateSchema = methodSchema.extend({
  id: z.string().min(1),
});

const defaultPaymentMethods = [
  { name: "Efectivo", type: "CASH" as const, requiresAccount: false },
  { name: "Transferencia", type: "TRANSFER" as const, requiresAccount: true },
];

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);

    for (const method of defaultPaymentMethods) {
      const existing = await prisma.paymentMethod.findFirst({
        where: {
          organizationId,
          name: method.name,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!existing) {
        await prisma.paymentMethod.create({
          data: {
            organizationId,
            name: method.name,
            type: method.type,
            requiresAccount: method.requiresAccount,
            requiresApproval: false,
            requiresDoubleCheck: true,
            isActive: true,
          },
        });
        continue;
      }

      if (existing.isActive === false) {
        await prisma.paymentMethod.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            requiresApproval: false,
            requiresDoubleCheck: true,
          },
        });
      }
    }

    await prisma.paymentMethod.updateMany({
      where: {
        organizationId,
        OR: [
          { requiresApproval: true },
          { requiresDoubleCheck: false },
        ],
      },
      data: {
        requiresApproval: false,
        requiresDoubleCheck: true,
      },
    });
    const methods = await prisma.paymentMethod.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      methods.map((method) => ({
        id: method.id,
        name: method.name,
        type: method.type,
        requiresAccount: method.requiresAccount,
        requiresApproval: method.requiresApproval,
        requiresDoubleCheck: method.requiresDoubleCheck,
        isActive: method.isActive,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = methodSchema.parse(await req.json());

    const method = await prisma.paymentMethod.create({
      data: {
        organizationId: membership.organizationId,
        name: body.name.trim(),
        type: body.type,
        requiresAccount: body.requiresAccount,
        requiresApproval: false,
        requiresDoubleCheck: true,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      id: method.id,
      name: method.name,
      type: method.type,
      requiresAccount: method.requiresAccount,
      requiresApproval: method.requiresApproval,
      requiresDoubleCheck: method.requiresDoubleCheck,
      isActive: method.isActive,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = methodUpdateSchema.parse(await req.json());

    const existing = await prisma.paymentMethod.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Metodo de pago no encontrado" },
        { status: 404 }
      );
    }

    const method = await prisma.paymentMethod.update({
      where: { id: body.id },
      data: {
        name: body.name.trim(),
        type: body.type,
        requiresAccount: body.requiresAccount,
        requiresApproval: false,
        requiresDoubleCheck: true,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      id: method.id,
      name: method.name,
      type: method.type,
      requiresAccount: method.requiresAccount,
      requiresApproval: method.requiresApproval,
      requiresDoubleCheck: method.requiresDoubleCheck,
      isActive: method.isActive,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const existing = await prisma.paymentMethod.findFirst({
      where: { id, organizationId: membership.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Metodo de pago no encontrado" },
        { status: 404 }
      );
    }

    await prisma.paymentMethod.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "Metodo con movimientos asociados" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
