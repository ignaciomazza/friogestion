import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { PRICE_LIST_ORDER_BY } from "@/lib/price-lists";
import QuotesClient from "./quotes-client";

export default async function QuotesPage() {
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

  const [quotes, priceLists, usdRate] = await Promise.all([
      prisma.quote.findMany({
        where: { organizationId: membership.organizationId },
        include: { customer: true, sale: true, priceList: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.priceList.findMany({
        where: { organizationId: membership.organizationId, isActive: true },
        orderBy: PRICE_LIST_ORDER_BY,
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
      <QuotesClient
      initialCustomers={[]}
      initialProducts={[]}
      initialQuotes={quotes.map((quote) => ({
        id: quote.id,
        customerName: quote.customer.displayName,
        quoteNumber: quote.quoteNumber,
        validUntil: quote.validUntil?.toISOString() ?? null,
        createdAt: quote.createdAt.toISOString(),
        subtotal: quote.subtotal?.toString() ?? null,
        taxes: quote.taxes?.toString() ?? null,
        total: quote.total?.toString() ?? null,
        status: quote.status,
        saleId: quote.sale?.id ?? null,
        priceListId: quote.priceListId ?? null,
        priceListName: quote.priceList?.name ?? null,
      }))}
      initialPriceLists={priceLists.map((priceList) => ({
        id: priceList.id,
        name: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        isConsumerFinal: priceList.isConsumerFinal,
        isActive: priceList.isActive,
        sortOrder: priceList.sortOrder,
      }))}
      initialLatestUsdRate={usdRate?.rate?.toString() ?? null}
    />
  );
}
