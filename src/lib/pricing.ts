type ProductListPrice = {
  priceListId: string;
  price: string | null;
};

const toNumber = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const validPrice = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return value;
};

const findListPrice = (
  prices: ProductListPrice[] | null | undefined,
  priceListId: string | null | undefined,
) => {
  if (!priceListId || !prices?.length) return null;
  const found = prices.find((price) => price.priceListId === priceListId);
  return validPrice(found?.price);
};

const findChosenPriceListId = ({
  prices,
  preferredPriceListId,
  customerPriceListId,
  defaultPriceListId,
}: {
  prices: ProductListPrice[] | null | undefined;
  preferredPriceListId?: string | null | undefined;
  customerPriceListId: string | null | undefined;
  defaultPriceListId: string | null | undefined;
}) => {
  if (findListPrice(prices, preferredPriceListId)) return preferredPriceListId ?? null;
  if (findListPrice(prices, customerPriceListId)) return customerPriceListId ?? null;
  if (findListPrice(prices, defaultPriceListId)) return defaultPriceListId ?? null;
  return null;
};

const deriveDynamicUsdListPrice = ({
  prices,
  chosenPriceListId,
  priceListOrderIds,
  productCost,
  productCostUsd,
  usdRateArs,
}: {
  prices: ProductListPrice[] | null | undefined;
  chosenPriceListId: string;
  priceListOrderIds: string[];
  productCost: string | null | undefined;
  productCostUsd: string | null | undefined;
  usdRateArs: number;
}) => {
  if (!prices?.length || !priceListOrderIds.length) return null;

  const costArsBase = toNumber(productCost);
  const costUsd = toNumber(productCostUsd);
  if (costArsBase === null || costUsd === null) return null;
  if (costArsBase < 0 || costUsd < 0 || usdRateArs <= 0) return null;

  let sourceBase = costArsBase;
  let dynamicPrice = costUsd * usdRateArs;

  for (const priceListId of priceListOrderIds) {
    const sourcePriceRaw = findListPrice(prices, priceListId);
    if (!sourcePriceRaw) return null;
    const sourcePrice = toNumber(sourcePriceRaw);
    if (sourcePrice === null || sourcePrice < 0) return null;

    let percentage = 0;
    if (sourceBase === 0) {
      if (sourcePrice !== 0) return null;
    } else {
      percentage = ((sourcePrice - sourceBase) / sourceBase) * 100;
    }

    dynamicPrice = dynamicPrice * (1 + percentage / 100);
    if (!Number.isFinite(dynamicPrice) || dynamicPrice < 0) return null;

    if (priceListId === chosenPriceListId) {
      return dynamicPrice.toFixed(2);
    }

    sourceBase = sourcePrice;
  }

  return null;
};

export const resolveSuggestedProductPrice = ({
  prices,
  productCost,
  productCostUsd,
  productPrice,
  preferredPriceListId,
  customerPriceListId,
  defaultPriceListId,
  usdRateArs,
  priceListOrderIds,
}: {
  prices: ProductListPrice[] | null | undefined;
  productCost?: string | null | undefined;
  productCostUsd?: string | null | undefined;
  productPrice: string | null | undefined;
  preferredPriceListId?: string | null | undefined;
  customerPriceListId: string | null | undefined;
  defaultPriceListId: string | null | undefined;
  usdRateArs?: number | null | undefined;
  priceListOrderIds?: string[] | null | undefined;
}) =>
  (() => {
    const chosenPriceListId = findChosenPriceListId({
      prices,
      preferredPriceListId,
      customerPriceListId,
      defaultPriceListId,
    });

    if (
      chosenPriceListId &&
      usdRateArs &&
      priceListOrderIds?.length
    ) {
      const dynamicPrice = deriveDynamicUsdListPrice({
        prices,
        chosenPriceListId,
        priceListOrderIds,
        productCost,
        productCostUsd,
        usdRateArs,
      });
      if (dynamicPrice) return dynamicPrice;
    }

    return (
      findListPrice(prices, preferredPriceListId) ??
      findListPrice(prices, customerPriceListId) ??
      findListPrice(prices, defaultPriceListId) ??
      validPrice(productPrice)
    );
  })();
