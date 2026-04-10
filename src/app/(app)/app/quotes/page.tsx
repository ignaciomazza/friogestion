import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
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

  const [customers, products, quotes, priceLists, organization, usdRate] =
    await Promise.all([
      prisma.customer.findMany({
        where: { organizationId: membership.organizationId, systemKey: null },
        orderBy: { createdAt: "desc" },
        take: 120,
      }),
      prisma.product.findMany({
        where: { organizationId: membership.organizationId },
        include: {
          priceItems: {
            select: {
              priceListId: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
      }),
      prisma.quote.findMany({
        where: { organizationId: membership.organizationId },
        include: { customer: true, sale: true, priceList: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.priceList.findMany({
        where: { organizationId: membership.organizationId, isActive: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.organization.findUnique({
        where: { id: membership.organizationId },
        select: { adjustStockOnQuoteConfirm: true },
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
      initialCustomers={customers.map((customer) => ({
        id: customer.id,
        displayName: customer.displayName,
        legalName: customer.legalName,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        type: customer.type,
        systemKey: customer.systemKey,
        defaultPriceListId: customer.defaultPriceListId,
      }))}
      initialProducts={products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        cost: product.cost?.toString() ?? null,
        costUsd: product.costUsd?.toString() ?? null,
        price: product.price?.toString() ?? null,
        prices: product.priceItems.map((priceItem) => ({
          priceListId: priceItem.priceListId,
          price: priceItem.price.toString(),
        })),
      }))}
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
      }))}
      initialAdjustStockOnConfirm={
        organization?.adjustStockOnQuoteConfirm ?? true
      }
      initialLatestUsdRate={usdRate?.rate?.toString() ?? null}
    />
  );
}
