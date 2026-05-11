type ProductListPrice = {
  priceListId: string;
  price: string | null;
  percentage?: string | null;
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

const validPercentage = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return value;
};

const findListPriceItem = (
  prices: ProductListPrice[] | null | undefined,
  priceListId: string,
) => prices?.find((price) => price.priceListId === priceListId) ?? null;

const normalizePriceNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
};

const calculatePriceFromPercentage = (
  basePrice: number | null,
  percentage: number | null,
) => {
  if (basePrice === null || percentage === null) return null;
  return normalizePriceNumber(basePrice * (1 + percentage / 100));
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

const resolvePercentageFromPriceItem = (
  priceItem: ProductListPrice | null,
  sourceBase: number,
) => {
  if (sourceBase < 0) return null;

  const storedPercentage = validPercentage(priceItem?.percentage);
  const percentage = toNumber(storedPercentage);
  if (percentage !== null) {
    return Number.isFinite(percentage) ? percentage : null;
  }

  const sourcePrice = toNumber(validPrice(priceItem?.price));
  if (sourcePrice === null || sourcePrice < 0) return null;

  if (sourceBase === 0) {
    return sourcePrice === 0 ? 0 : null;
  }

  const derivedPercentage = ((sourcePrice - sourceBase) / sourceBase) * 100;
  return Number.isFinite(derivedPercentage) ? derivedPercentage : null;
};

const resolveDefaultPriceListId = (
  priceListOrderIds: string[],
  defaultPriceListId: string | null | undefined,
) =>
  defaultPriceListId && priceListOrderIds.includes(defaultPriceListId)
    ? defaultPriceListId
    : (priceListOrderIds[0] ?? null);

const deriveDynamicUsdListPrice = ({
  prices,
  chosenPriceListId,
  defaultPriceListId,
  priceListOrderIds,
  productCostUsd,
  usdRateArs,
}: {
  prices: ProductListPrice[] | null | undefined;
  chosenPriceListId: string;
  defaultPriceListId: string | null | undefined;
  priceListOrderIds: string[];
  productCostUsd: string | null | undefined;
  usdRateArs: number;
}) => {
  if (!prices?.length || !priceListOrderIds.length) return null;
  if (!priceListOrderIds.includes(chosenPriceListId)) return null;

  const costUsd = toNumber(productCostUsd);
  if (costUsd === null) return null;
  if (costUsd < 0 || usdRateArs <= 0) return null;

  const dynamicCostArs = normalizePriceNumber(costUsd * usdRateArs);
  if (dynamicCostArs === null) return null;

  const dynamicDefaultPriceListId = resolveDefaultPriceListId(
    priceListOrderIds,
    defaultPriceListId,
  );
  if (!dynamicDefaultPriceListId) return null;

  const defaultPriceItem = findListPriceItem(prices, dynamicDefaultPriceListId);
  const defaultPercentage = resolvePercentageFromPriceItem(
    defaultPriceItem,
    dynamicCostArs,
  );
  const dynamicDefaultPrice = calculatePriceFromPercentage(
    dynamicCostArs,
    defaultPercentage,
  );
  if (dynamicDefaultPrice === null) return null;

  if (chosenPriceListId === dynamicDefaultPriceListId) {
    return dynamicDefaultPrice.toFixed(2);
  }

  const chosenPriceItem = findListPriceItem(prices, chosenPriceListId);
  const storedDefaultPrice =
    toNumber(validPrice(defaultPriceItem?.price)) ?? dynamicDefaultPrice;
  const chosenPercentage = resolvePercentageFromPriceItem(
    chosenPriceItem,
    storedDefaultPrice,
  );
  const dynamicChosenPrice = calculatePriceFromPercentage(
    dynamicDefaultPrice,
    chosenPercentage,
  );

  return dynamicChosenPrice === null ? null : dynamicChosenPrice.toFixed(2);
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
      toNumber(productCost) === null &&
      priceListOrderIds?.length
    ) {
      const dynamicPrice = deriveDynamicUsdListPrice({
        prices,
        chosenPriceListId,
        defaultPriceListId,
        priceListOrderIds,
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
