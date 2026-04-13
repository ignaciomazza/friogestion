import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { getAfipClient } from "@/lib/afip/client";
import { getAfipStatus } from "@/lib/afip/status";
import BillingClient from "./billing-client";

export default async function BillingPage() {
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

  const sales = await prisma.sale.findMany({
    where: { organizationId: membership.organizationId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
    where: { organizationId: membership.organizationId },
    select: { defaultPointOfSale: true },
  });

  const afipStatus = await getAfipStatus(membership.organizationId);
  let clientReady = false;

  if (afipStatus.ok) {
    try {
      await getAfipClient(membership.organizationId);
      clientReady = true;
    } catch {
      clientReady = false;
    }
  }

  return (
    <BillingClient
      afipStatus={{ ...afipStatus, clientReady }}
      defaultPointOfSale={fiscalConfig?.defaultPointOfSale ?? null}
      initialSales={sales.map((sale) => ({
        id: sale.id,
        customerName: sale.customer.displayName,
        customerTaxId: sale.customer.taxId,
        customerType: sale.customer.type,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate?.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
        subtotal: sale.subtotal?.toString() ?? null,
        taxes: sale.taxes?.toString() ?? null,
        extraType: sale.extraType ?? null,
        extraValue: sale.extraValue?.toString() ?? null,
        extraAmount: sale.extraAmount?.toString() ?? null,
        total: sale.total?.toString() ?? null,
        status: sale.status,
        billingStatus: sale.billingStatus,
        items: sale.items.map((item) => ({
          id: item.id,
          productName: item.productId,
          qty: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          total: item.total.toString(),
          taxRate: item.taxRate?.toString() ?? "0",
          taxAmount: item.taxAmount?.toString() ?? null,
        })),
      }))}
    />
  );
}
