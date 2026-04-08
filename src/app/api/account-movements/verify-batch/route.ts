import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import {
  DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
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
    const body = batchSchema.parse(await req.json());

    const pending = await prisma.accountMovement.findMany({
      where: {
        organizationId,
        id: { in: body.ids },
        requiresVerification: true,
        verifiedAt: null,
      },
      select: { id: true },
    });

    if (!pending.length) {
      return NextResponse.json({ updated: 0 });
    }

    const now = new Date();
    const result = await prisma.accountMovement.updateMany({
      where: { id: { in: pending.map((item) => item.id) } },
      data: {
        verifiedAt: now,
        verifiedByUserId: payload.userId,
      },
    });

    return NextResponse.json({ updated: result.count });
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
