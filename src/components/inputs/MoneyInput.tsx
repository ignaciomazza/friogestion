"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  maxDecimals?: number;
};

const normalizeInteger = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "") || "0";
};

export const normalizeMoneyInput = (rawValue: string, maxDecimals = 2) => {
  if (!rawValue) return "";

  const cleaned = rawValue.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  const commaIndex = cleaned.lastIndexOf(",");

  if (commaIndex === -1) {
    if (cleaned.endsWith(".")) {
      const integerPart = normalizeInteger(cleaned.slice(0, -1));
      return `${integerPart || "0"}.`;
    }
    return normalizeInteger(cleaned);
  }

  const integerRaw = cleaned.slice(0, commaIndex);
  const decimalRaw = cleaned.slice(commaIndex + 1);
  const integerPart = normalizeInteger(integerRaw) || "0";
  const decimalPart = decimalRaw.replace(/[^\d]/g, "").slice(0, maxDecimals);
  const hasTrailingSeparator = cleaned.endsWith(",");

  if (decimalPart) {
    return `${integerPart}.${decimalPart}`;
  }

  if (hasTrailingSeparator) {
    return `${integerPart}.`;
  }

  return integerPart;
};

const formatMoneyDisplay = (value: string) => {
  if (!value) return "";

  const hasTrailingDecimal = value.endsWith(".");
  const [integerRaw, decimalRaw = ""] = value.split(".");
  const integerPart = normalizeInteger(integerRaw) || "0";
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decimalRaw) {
    return `${groupedInteger},${decimalRaw}`;
  }

  if (hasTrailingDecimal) {
    return `${groupedInteger},`;
  }

  return groupedInteger;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { value, onValueChange, maxDecimals = 2, ...props },
    ref
  ) {
    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={formatMoneyDisplay(value)}
        onChange={(event) => {
          onValueChange(normalizeMoneyInput(event.target.value, maxDecimals));
        }}
      />
    );
  }
);
