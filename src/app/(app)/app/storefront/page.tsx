import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import StorefrontClient from "./storefront-client";

const ALLOWED_ROLES = ["OWNER", "ADMIN", "SALES"];

export default async function StorefrontPage() {
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

  if (!ALLOWED_ROLES.includes(membership.role)) {
    redirect("/app");
  }

  return <StorefrontClient role={membership.role} />;
}
