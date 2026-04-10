import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import TopbarClient from "@/components/TopbarClient";
import { fetchDolarBlue, fetchDolarOfficial } from "@/lib/market/dolar-hoy";

type OrgOption = {
  id: string;
  name: string;
  legalName?: string | null;
};

export default async function Topbar() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return null;
  }

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { name: true, email: true },
    }),
    prisma.membership.findMany({
      where: { userId: payload.userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!memberships.length) {
    return null;
  }

  const activeMembership =
    memberships.find(
      (membership) => membership.organizationId === payload.activeOrgId
    ) ?? memberships[0];

  if (!activeMembership) {
    return null;
  }

  const activeOrg: OrgOption = {
    id: activeMembership.organization.id,
    name: activeMembership.organization.name,
    legalName: activeMembership.organization.legalName,
  };

  const latestRate = activeOrg
    ? await prisma.exchangeRate.findFirst({
        where: {
          organizationId: activeOrg.id,
          baseCode: "USD",
          quoteCode: "ARS",
        },
        orderBy: { asOf: "desc" },
      })
    : null;

  const [blueRate, officialRate] = await Promise.all([
    fetchDolarBlue(),
    fetchDolarOfficial(),
  ]);
  const sessionUserName =
    user?.name?.trim() || user?.email?.trim().split("@")[0] || "Usuario";

  return (
    <TopbarClient
      latestRate={latestRate ? latestRate.rate.toString() : null}
      blueRate={blueRate}
      officialRate={officialRate}
      role={activeMembership?.role ?? null}
      sessionUserName={sessionUserName}
    />
  );
}
