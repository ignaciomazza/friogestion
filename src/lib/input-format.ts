type FormatDecimalOptions = {
  maxDecimals: number;
  useGrouping?: boolean;
};

const isNormalizedDecimal = (value: string, maxDecimals: number) => {
  if (!value) return false;
  if (!/^\d+(\.\d*)?$/.test(value)) return false;
  const [, decimalPart = ""] = value.split(".");
  return decimalPart.length <= maxDecimals;
};

export const normalizeDecimalInput = (value: string, maxDecimals: number) => {
  if (!value) return "";
  const cleaned = value.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;
  const hasMixedSeparators = commaCount > 0 && dotCount > 0;
  const separator = hasMixedSeparators
    ? cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? ","
      : "."
    : commaCount
      ? ","
      : dotCount
        ? "."
        : null;
  const separatorCount =
    separator === "," ? commaCount : separator === "." ? dotCount : 0;

  let integerRaw = cleaned;
  let decimalRaw = "";
  let endsWithSeparator = false;
  let useDecimal = false;

  if (separator) {
    const sepIndex = cleaned.lastIndexOf(separator);
    integerRaw = cleaned.slice(0, sepIndex);
    decimalRaw = cleaned.slice(sepIndex + 1);
    endsWithSeparator = sepIndex === cleaned.length - 1;
    const decimalDigits = decimalRaw.replace(/[^\d]/g, "");
    if (hasMixedSeparators) {
      useDecimal = true;
    } else if (separatorCount === 1) {
      if (endsWithSeparator) {
        useDecimal = true;
      } else if (
        decimalDigits.length > 0 &&
        decimalDigits.length <= maxDecimals
      ) {
        useDecimal = true;
      }
    }
  }

  if (!useDecimal) {
    integerRaw = cleaned;
    decimalRaw = "";
    endsWithSeparator = false;
  }

  const integerPart = integerRaw.replace(/[^\d]/g, "");
  const decimalPart = decimalRaw.replace(/[^\d]/g, "");

  if (!integerPart && !decimalPart) return "";

  const trimmedInteger = integerPart.replace(/^0+(?=\d)/, "");
  const normalizedInteger = trimmedInteger || "0";
  const normalizedDecimal = decimalPart.slice(0, maxDecimals);

  if (normalizedDecimal) {
    return `${normalizedInteger}.${normalizedDecimal}`;
  }

  return endsWithSeparator ? `${normalizedInteger}.` : normalizedInteger;
};

const formatDecimalInput = (rawValue: string, options: FormatDecimalOptions) => {
  const normalized = isNormalizedDecimal(rawValue, options.maxDecimals)
    ? rawValue
    : normalizeDecimalInput(rawValue, options.maxDecimals);
  if (!normalized) return "";
  const hasTrailingDecimal = normalized.endsWith(".");
  const [integerPart, decimalPart = ""] = normalized.split(".");
  const withGrouping = options.useGrouping
    ? integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : integerPart;
  if (decimalPart) return `${withGrouping},${decimalPart}`;
  return hasTrailingDecimal ? `${withGrouping},` : withGrouping;
};

export const formatCurrencyInput = (rawValue: string) =>
  formatDecimalInput(rawValue, { maxDecimals: 2, useGrouping: true });

export const formatPercentInput = (rawValue: string) =>
  formatDecimalInput(rawValue, { maxDecimals: 2 });

export const formatQuantityInput = (rawValue: string) =>
  formatDecimalInput(rawValue, { maxDecimals: 3 });

export const normalizeIntegerInput = (value: string) =>
  value.replace(/[^\d]/g, "");
