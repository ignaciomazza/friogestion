import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import DeveloperClient from "./developer-client";

const ALLOWED_ROLES = ["DEVELOPER"];

type MembershipWithOrg = {
  role: string;
  organization: {
    id: string;
    name: string;
    legalName: string | null;
    taxId: string | null;
  };
};

type OrganizationSummary = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  role: string;
  createdAt: string;
  counts: {
    users: number;
    products: number;
    customers: number;
    sales: number;
  };
};

export default async function DeveloperPage() {
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

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true },
    }),
    prisma.membership.findMany({
      where: { userId: payload.userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            legalName: true,
            taxId: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user || !user.isActive) {
    redirect("/login");
  }

  const typedMemberships = memberships as MembershipWithOrg[];
  const activeMembership =
    typedMemberships.find(
      (membership) => membership.organization.id === payload.activeOrgId
    ) ?? typedMemberships[0];

  if (!activeMembership) {
    redirect("/app");
  }

  if (!ALLOWED_ROLES.includes(activeMembership.role)) {
    redirect("/app");
  }

  const organizationIds = typedMemberships.map(
    (membership) => membership.organization.id
  );
  const organizationsWithCounts = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      legalName: true,
      taxId: true,
      createdAt: true,
      _count: {
        select: {
          memberships: true,
          products: true,
          customers: true,
          sales: true,
        },
      },
    },
  });

  const orgMap = new Map(
    organizationsWithCounts.map((organization) => [organization.id, organization])
  );

  const organizations: OrganizationSummary[] = typedMemberships.flatMap(
    (membership) => {
      const organization = orgMap.get(membership.organization.id);
      if (!organization) return [];
      return [
        {
          id: organization.id,
          name: organization.name,
          legalName: organization.legalName,
          taxId: organization.taxId,
          role: membership.role,
          createdAt: organization.createdAt.toISOString(),
          counts: {
            users: organization._count.memberships,
            products: organization._count.products,
            customers: organization._count.customers,
            sales: organization._count.sales,
          },
        },
      ];
    }
  );

  return (
    <DeveloperClient
      activeOrgId={activeMembership.organization.id}
      canCreateOrganizations={activeMembership.role === "DEVELOPER"}
      organizations={organizations}
    />
  );
}
