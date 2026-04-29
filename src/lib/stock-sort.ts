export const STOCK_SORT_VALUES = [
  "created-desc",
  "created-asc",
  "code-asc",
  "code-desc",
  "name-asc",
  "name-desc",
  "brand-asc",
  "brand-desc",
] as const;

export type StockSort = (typeof STOCK_SORT_VALUES)[number];

export const DEFAULT_STOCK_SORT: StockSort = "name-asc";

export const normalizeStockSort = (
  value: string | null | undefined,
): StockSort => {
  return STOCK_SORT_VALUES.includes(value as StockSort)
    ? (value as StockSort)
    : DEFAULT_STOCK_SORT;
};
