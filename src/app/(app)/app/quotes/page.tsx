import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { PRICE_LIST_ORDER_BY } from "@/lib/price-lists";
import QuotesClient from "./quotes-client";

const QUOTES_PAGE_SIZE = 50;

const toMoneyString = (value: { toString(): string } | null | undefined) =>
  value ? value.toString() : null;

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

  const [quotePage, priceLists, usdRate] = await Promise.all([
      prisma.quote.findMany({
        where: { organizationId: membership.organizationId },
        include: { customer: true, sale: true, priceList: true },
        orderBy: { createdAt: "desc" },
        take: QUOTES_PAGE_SIZE + 1,
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
  const quotes = quotePage.slice(0, QUOTES_PAGE_SIZE);
  const quotesHasMore = quotePage.length > QUOTES_PAGE_SIZE;

  return (
      <QuotesClient
      initialCustomers={[]}
      initialProducts={[]}
      initialQuotes={quotes.map((quote) => {
        const source = quote.sale ?? quote;
        return {
          id: quote.id,
          customerName: quote.customer.displayName,
          customerPhone: quote.customer.phone,
          quoteNumber: quote.quoteNumber,
          validUntil: quote.validUntil?.toISOString() ?? null,
          createdAt: quote.createdAt.toISOString(),
          subtotal: toMoneyString(source.subtotal),
          taxes: toMoneyString(source.taxes),
          extraType: source.extraType ?? null,
          extraValue: toMoneyString(source.extraValue),
          extraAmount: toMoneyString(source.extraAmount),
          total: toMoneyString(source.total),
          status: quote.status,
          saleId: quote.sale?.id ?? null,
          priceListId: quote.priceListId ?? null,
          priceListName: quote.priceList?.name ?? null,
        };
      })}
      initialQuotesHasMore={quotesHasMore}
      initialQuotesNextOffset={quotesHasMore ? quotes.length : null}
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
