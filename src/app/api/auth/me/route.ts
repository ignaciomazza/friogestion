import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/tenant";

export async function GET(req: NextRequest) {
  try {
    const payload = await requireAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Usuario inactivo" }, { status: 401 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: payload.activeOrgId,
          userId: payload.userId,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Sin acceso a la organizacion" },
        { status: 403 }
      );
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: payload.userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      activeOrg: {
        id: membership.organization.id,
        name: membership.organization.name,
        legalName: membership.organization.legalName,
      },
      role: membership.role,
      organizations: memberships.map((item) => ({
        id: item.organization.id,
        name: item.organization.name,
        legalName: item.organization.legalName,
      })),
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
