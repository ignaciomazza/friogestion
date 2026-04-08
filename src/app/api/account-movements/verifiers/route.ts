import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import {
  DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";

export async function GET(req: NextRequest) {
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
    await requireRole(req, allowedRoles);

    const memberships = await prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      memberships.map((membership) => ({
        id: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
