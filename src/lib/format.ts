const formatterCache = new Map<string, Intl.NumberFormat>();

type CurrencyCode = "ARS" | "USD";

export function formatCurrency(
  value: number | string | null | undefined,
  currency: CurrencyCode,
  locale = "es-AR"
) {
  if (value === null || value === undefined) return "-";
  const numeric =
    typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (!Number.isFinite(numeric)) return "-";

  const cacheKey = `${locale}-${currency}`;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(cacheKey, formatter);
  }

  return formatter.format(numeric);
}

export function formatCurrencyARS(value: number | string | null | undefined) {
  return formatCurrency(value, "ARS");
}

export function formatCurrencyUSD(value: number | string | null | undefined) {
  return formatCurrency(value, "USD");
}
