import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { canAccessDashboard } from "@/lib/auth/rbac";

type SaleRow = {
  id: string;
  createdAt: Date;
  saleDate: Date | null;
  total: unknown;
  customer: { displayName: string } | null;
};

type PurchaseRow = {
  id: string;
  createdAt: Date;
  total: unknown;
  supplier: { displayName: string } | null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const maybe = value as { toNumber?: () => number };
    if (typeof maybe.toNumber === "function") return maybe.toNumber();
  }
  return 0;
};

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default async function AppDashboardPage() {
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
    select: { role: true },
  });

  if (!membership) {
    redirect("/login");
  }

  if (!canAccessDashboard(membership.role)) {
    redirect("/app/quotes");
  }

  const now = new Date();
  const startOfWindow = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startOfThirtyDays = new Date(now);
  startOfThirtyDays.setDate(now.getDate() - 30);

  const [
    latestRate,
    stats,
    salesWindow,
    purchaseWindow,
    newCustomers,
    newSuppliers,
    saleItemsWindow,
  ] = await Promise.all([
    prisma.exchangeRate.findFirst({
      where: {
        organizationId: payload.activeOrgId,
        baseCode: "USD",
        quoteCode: "ARS",
      },
      orderBy: { asOf: "desc" },
    }),
    prisma.$transaction([
      prisma.product.count({
        where: { organizationId: payload.activeOrgId },
      }),
      prisma.customer.count({
        where: { organizationId: payload.activeOrgId },
      }),
      prisma.supplier.count({
        where: { organizationId: payload.activeOrgId },
      }),
      prisma.purchaseInvoice.count({
        where: { organizationId: payload.activeOrgId },
      }),
      prisma.sale.count({ where: { organizationId: payload.activeOrgId } }),
    ]),
    prisma.sale.findMany({
      where: {
        organizationId: payload.activeOrgId,
        createdAt: { gte: startOfWindow },
      },
      select: {
        id: true,
        createdAt: true,
        saleDate: true,
        total: true,
        customer: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        organizationId: payload.activeOrgId,
        createdAt: { gte: startOfWindow },
      },
      select: {
        id: true,
        createdAt: true,
        total: true,
        supplier: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.customer.count({
      where: {
        organizationId: payload.activeOrgId,
        createdAt: { gte: startOfThirtyDays },
      },
    }),
    prisma.supplier.count({
      where: {
        organizationId: payload.activeOrgId,
        createdAt: { gte: startOfThirtyDays },
      },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: {
          organizationId: payload.activeOrgId,
          createdAt: { gte: startOfWindow },
        },
      },
      select: {
        total: true,
        product: { select: { name: true } },
        sale: { select: { createdAt: true, saleDate: true } },
      },
    }),
  ]);

  const [productCount, customerCount, supplierCount, purchaseCount, saleCount] =
    stats;

  const salesData = (salesWindow as SaleRow[]).map((sale) => ({
    id: sale.id,
    name: sale.customer?.displayName ?? "Sin cliente",
    total:
      sale.total === null || sale.total === undefined
        ? null
        : toNumber(sale.total),
    occurredAt: (sale.saleDate ?? sale.createdAt).toISOString(),
  }));

  const purchasesData = (purchaseWindow as PurchaseRow[]).map((purchase) => ({
    id: purchase.id,
    name: purchase.supplier?.displayName ?? "Sin proveedor",
    total:
      purchase.total === null || purchase.total === undefined
        ? null
        : toNumber(purchase.total),
    occurredAt: purchase.createdAt.toISOString(),
  }));

  const saleItemsData = saleItemsWindow.map((item) => ({
    productName: item.product.name,
    total: toNumber(item.total),
    occurredAt: (item.sale.saleDate ?? item.sale.createdAt).toISOString(),
  }));

  const latestRateData = latestRate
    ? { rate: toNumber(latestRate.rate), asOf: latestRate.asOf.toISOString() }
    : null;

  return (
    <DashboardView
      latestRate={latestRateData}
      dataStart={toInputDate(startOfWindow)}
      counts={{
        productCount,
        customerCount,
        supplierCount,
        purchaseCount,
        saleCount,
        newCustomers,
        newSuppliers,
      }}
      sales={salesData}
      purchases={purchasesData}
      saleItems={saleItemsData}
    />
  );
}
