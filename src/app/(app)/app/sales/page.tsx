import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import SalesClient from "./sales-client";
import { backfillPendingReceipts } from "@/lib/receipts/backfill";
import {
  SALES_PAGE_SIZE,
  getSalesStatsSummary,
  salesListInclude,
  salesOrderBy,
  serializeSaleListItem,
} from "@/lib/sales/list";

const MANAGE_ROLES = ["OWNER", "ADMIN"];

export default async function SalesPage() {
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
  });

  if (!membership) {
    redirect("/app");
  }

  const canManage = MANAGE_ROLES.includes(membership.role);
  await backfillPendingReceipts(membership.organizationId, payload.userId);

  const [sales, stats, events, paymentMethods, accounts, currencies, rate] =
    await Promise.all([
    prisma.sale.findMany({
      where: { organizationId: membership.organizationId },
      include: salesListInclude,
      orderBy: salesOrderBy("newest"),
      take: SALES_PAGE_SIZE,
    }),
    getSalesStatsSummary(membership.organizationId),
    canManage
      ? prisma.saleEvent.findMany({
          where: { organizationId: membership.organizationId },
          include: {
            sale: { include: { customer: true } },
            actor: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 60,
        })
      : Promise.resolve([]),
    prisma.paymentMethod.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeAccount.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeCurrency.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    }),
    prisma.exchangeRate.findFirst({
      where: {
        organizationId: membership.organizationId,
        baseCode: "USD",
        quoteCode: "ARS",
      },
      orderBy: { asOf: "desc" },
    }),
  ]);

  return (
    <SalesClient
      role={membership.role}
      initialSales={sales.map((sale) => serializeSaleListItem(sale))}
      initialStats={stats}
      initialTotalResults={stats.totalSales}
      initialNextOffset={
        sales.length < stats.totalSales ? sales.length : null
      }
      initialHasMore={sales.length < stats.totalSales}
      initialEvents={
        canManage
          ? events.map((event) => ({
              id: event.id,
              saleId: event.saleId,
              saleNumber: event.sale.saleNumber,
              customerName: event.sale.customer.displayName,
              action: event.action,
              note: event.note ?? null,
              actorName: event.actor?.name ?? null,
              actorEmail: event.actor?.email ?? null,
              createdAt: event.createdAt.toISOString(),
            }))
          : []
      }
      paymentMethods={paymentMethods.map((method) => ({
        id: method.id,
        name: method.name,
        type: method.type,
        requiresAccount: method.requiresAccount,
        requiresApproval: method.requiresApproval,
        requiresDoubleCheck: method.requiresDoubleCheck,
      }))}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currencyCode: account.currencyCode,
      }))}
      currencies={currencies.map((currency) => ({
        id: currency.id,
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        isDefault: currency.isDefault,
      }))}
      latestUsdRate={rate?.rate?.toString() ?? null}
    />
  );
}
