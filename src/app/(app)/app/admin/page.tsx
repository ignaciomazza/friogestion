import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import AdminClient from "./admin-client";
import { getAfipStatus } from "@/lib/afip/status";
import { getAfipClient } from "@/lib/afip/client";
import { describeArcaJob } from "@/lib/arca/errors";
import { hasValidSecretsKey } from "@/lib/crypto/secrets";
import {
  DEFAULT_RECEIPT_APPROVAL_ROLES,
  DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";

const ALLOWED_ROLES = ["OWNER", "ADMIN"];

export default async function AdminPage() {
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
      select: { email: true },
    }),
    prisma.membership.findMany({
      where: { userId: payload.userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user) {
    redirect("/login");
  }

  const activeMembership =
    memberships.find(
      (membership) => membership.organizationId === payload.activeOrgId
    ) ?? memberships[0];

  if (!activeMembership) {
    redirect("/app");
  }

  if (!ALLOWED_ROLES.includes(activeMembership.role)) {
    redirect("/app");
  }

  const [
    orgUsers,
    stats,
    arcaConfig,
    arcaJob,
    paymentMethods,
    accounts,
    currencies,
    orgSettings,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: activeMembership.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.$transaction([
      prisma.product.count({
        where: { organizationId: activeMembership.organizationId },
      }),
      prisma.customer.count({
        where: { organizationId: activeMembership.organizationId },
      }),
      prisma.supplier.count({
        where: { organizationId: activeMembership.organizationId },
      }),
      prisma.sale.count({
        where: { organizationId: activeMembership.organizationId },
      }),
    ]),
    prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: activeMembership.organizationId },
    }),
    prisma.arcaConnectionJob.findFirst({
      where: { organizationId: activeMembership.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.paymentMethod.findMany({
      where: { organizationId: activeMembership.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeAccount.findMany({
      where: { organizationId: activeMembership.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeCurrency.findMany({
      where: { organizationId: activeMembership.organizationId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    }),
    prisma.organization.findUnique({
      where: { id: activeMembership.organizationId },
      select: {
        receiptApprovalRoles: true,
        receiptDoubleCheckRoles: true,
        defaultDeliveryNotePointOfSale: true,
      },
    }),
  ]);

  const afipStatus = await getAfipStatus(activeMembership.organizationId);
  const afipWithClient = {
    ...afipStatus,
    clientReady: false,
  };

  if (afipStatus.ok) {
    try {
      await getAfipClient(activeMembership.organizationId);
      afipWithClient.clientReady = true;
    } catch {
      afipWithClient.clientReady = false;
    }
  }

  return (
    <AdminClient
      activeOrg={{
        id: activeMembership.organization.id,
        name: activeMembership.organization.name,
      }}
      users={orgUsers.map((membership) => ({
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        isActive: membership.user.isActive,
      }))}
      stats={{
        products: stats[0],
        customers: stats[1],
        suppliers: stats[2],
        sales: stats[3],
      }}
      afipStatus={afipWithClient}
      arcaStatus={{
        secretsKeyValid: hasValidSecretsKey(),
        config: arcaConfig
          ? {
              status: arcaConfig.status,
              taxIdRepresentado: arcaConfig.taxIdRepresentado,
              taxIdLogin: arcaConfig.taxIdLogin,
              alias: arcaConfig.alias,
              authorizedServices: arcaConfig.authorizedServices,
              lastError: arcaConfig.lastError,
              lastOkAt: arcaConfig.lastOkAt?.toISOString() ?? null,
            }
          : null,
        job: arcaJob
          ? {
              id: arcaJob.id,
              status: arcaJob.status,
              step: arcaJob.step,
              services: arcaJob.services,
              currentServiceIndex: arcaJob.currentServiceIndex,
              lastError: arcaJob.lastError,
              createdAt: arcaJob.createdAt.toISOString(),
              updatedAt: arcaJob.updatedAt.toISOString(),
              completedAt: arcaJob.completedAt?.toISOString() ?? null,
            }
          : null,
        jobInfo: arcaJob ? describeArcaJob(arcaJob) : null,
      }}
      paymentMethods={paymentMethods.map((method) => ({
        id: method.id,
        name: method.name,
        type: method.type,
        requiresAccount: method.requiresAccount,
        requiresApproval: method.requiresApproval,
        requiresDoubleCheck: method.requiresDoubleCheck,
        isActive: method.isActive,
      }))}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currencyCode: account.currencyCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        cbu: account.cbu,
        alias: account.alias,
        isActive: account.isActive,
      }))}
      currencies={currencies.map((currency) => ({
        id: currency.id,
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        isDefault: currency.isDefault,
      }))}
      receiptApprovalRoles={resolveConfiguredRoles(
        orgSettings?.receiptApprovalRoles,
        DEFAULT_RECEIPT_APPROVAL_ROLES
      )}
      receiptDoubleCheckRoles={resolveConfiguredRoles(
        orgSettings?.receiptDoubleCheckRoles,
        DEFAULT_RECEIPT_DOUBLE_CHECK_ROLES
      )}
      defaultDeliveryNotePointOfSale={
        orgSettings?.defaultDeliveryNotePointOfSale ?? 1
      }
    />
  );
}
