import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import {
  DEFAULT_RECEIPT_APPROVAL_ROLES,
  resolveConfiguredRoles,
} from "@/lib/auth/receipt-controls";
import SalesClient from "./sales-client";

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

  const [sales, events, paymentMethods, accounts, currencies, orgSettings, rate] =
    await Promise.all([
    prisma.sale.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        customer: true,
        items: { include: { product: true } },
        receipts: {
          where: { status: "CONFIRMED" },
          select: {
            lines: {
              select: {
                accountMovement: {
                  select: { requiresVerification: true, verifiedAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
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
    prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { receiptApprovalRoles: true },
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
      initialSales={sales.map((sale) => ({
        hasPendingDoubleCheck: sale.receipts.some((receipt) =>
          receipt.lines.some(
            (line) =>
              line.accountMovement?.requiresVerification &&
              !line.accountMovement.verifiedAt
          )
        ),
        id: sale.id,
        customerName: sale.customer.displayName,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate?.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
        subtotal: sale.subtotal?.toString() ?? null,
        taxes: sale.taxes?.toString() ?? null,
        extraType: sale.extraType ?? null,
        extraValue: sale.extraValue?.toString() ?? null,
        extraAmount: sale.extraAmount?.toString() ?? null,
        total: sale.total?.toString() ?? null,
        paidTotal: sale.paidTotal?.toString() ?? "0",
        balance: sale.balance?.toString() ?? "0",
        paymentStatus: sale.paymentStatus,
        status: sale.status,
        billingStatus: sale.billingStatus,
        items: sale.items.map((item) => ({
          id: item.id,
          productName: item.product.name,
          qty: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          total: item.total.toString(),
          taxRate: item.taxRate?.toString() ?? null,
          taxAmount: item.taxAmount?.toString() ?? null,
        })),
      }))}
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
      approvalRoles={resolveConfiguredRoles(
        orgSettings?.receiptApprovalRoles,
        DEFAULT_RECEIPT_APPROVAL_ROLES
      )}
      latestUsdRate={rate?.rate?.toString() ?? null}
    />
  );
}
