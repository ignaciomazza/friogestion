import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { resolveReceiptDoubleCheckRoles } from "@/lib/auth/receipt-controls";
import IncomeCheckClient from "./income-check-client";

export default async function IncomeCheckPage() {
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
    redirect("/app");
  }

  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: payload.activeOrgId,
          userId: payload.userId,
        },
      },
      select: { role: true },
    }),
    prisma.organization.findUnique({
      where: { id: payload.activeOrgId },
      select: { receiptDoubleCheckRoles: true },
    }),
  ]);

  if (!membership) {
    redirect("/app");
  }

  const allowedRoles = resolveReceiptDoubleCheckRoles(
    org?.receiptDoubleCheckRoles
  );

  if (!allowedRoles.includes(membership.role)) {
    redirect("/app");
  }

  return <IncomeCheckClient />;
}
