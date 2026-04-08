import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";

async function requireMembership(req: NextRequest) {
  const payload = await requireAuth(req);
  if (!payload.activeOrgId) {
    throw new Error("NO_ACTIVE_ORG");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: payload.activeOrgId,
        userId: payload.userId,
      },
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  return { payload, membership };
}

export async function requireAuth(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }
  const payload = await verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new Error("UNAUTHORIZED");
  }
  return payload;
}

export async function requireOrg(req: NextRequest) {
  const { membership } = await requireMembership(req);
  return membership.organizationId;
}

export async function requireRole(req: NextRequest, roles: string[]) {
  const { payload, membership } = await requireMembership(req);
  if (!roles.includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }
  return { payload, membership };
}
