type ProductListPrice = {
  priceListId: string;
  price: string | null;
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

export const resolveSuggestedProductPrice = ({
  prices,
  productPrice,
  customerPriceListId,
  defaultPriceListId,
}: {
  prices: ProductListPrice[] | null | undefined;
  productPrice: string | null | undefined;
  customerPriceListId: string | null | undefined;
  defaultPriceListId: string | null | undefined;
}) =>
  findListPrice(prices, customerPriceListId) ??
  findListPrice(prices, defaultPriceListId) ??
  validPrice(productPrice);

