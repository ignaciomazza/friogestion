import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import {
  DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";

const verifySchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { receiptDoubleCheckRoles: true },
    });
    const allowedRoles = resolveConfiguredRoles(
      org?.receiptDoubleCheckRoles,
      DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES
    );
    const { payload } = await requireRole(req, allowedRoles);
    const body = verifySchema.parse(await req.json());

    const movement = await prisma.accountMovement.findFirst({
      where: { id: body.id, organizationId },
      select: { id: true, requiresVerification: true, verifiedAt: true },
    });

    if (!movement) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    if (!movement.requiresVerification) {
      return NextResponse.json(
        { error: "El movimiento no requiere verificacion" },
        { status: 409 }
      );
    }

    if (movement.verifiedAt) {
      return NextResponse.json(
        { error: "El movimiento ya fue verificado" },
        { status: 409 }
      );
    }

    const updated = await prisma.accountMovement.update({
      where: { id: movement.id },
      data: {
        verifiedAt: new Date(),
        verifiedByUserId: payload.userId,
      },
    });

    return NextResponse.json({
      id: updated.id,
      verifiedAt: updated.verifiedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo verificar" },
      { status: 400 }
    );
  }
}
