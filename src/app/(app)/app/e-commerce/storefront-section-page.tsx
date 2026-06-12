import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { hasAnyRole, WRITE_ROLES } from "@/lib/auth/rbac";
import StorefrontClient, {
  type StorefrontSectionKey,
} from "../storefront/storefront-client";

export async function renderStorefrontSectionPage(
  section: StorefrontSectionKey,
) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/login");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    redirect("/login");
  }

  if (!payload.activeOrgId) {
    redirect("/login");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: payload.activeOrgId,
        userId: payload.userId,
      },
    },
    select: {
      organizationId: true,
      role: true,
    },
  });

  if (!membership) {
    redirect("/app");
  }

  if (!hasAnyRole(membership.role, WRITE_ROLES)) {
    redirect("/app");
  }

  return <StorefrontClient role={membership.role} section={section} />;
}
