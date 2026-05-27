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
  prefix?: string;
  suffix?: string;
  caretToEndOnFocus?: boolean;
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

const formatMoneyDisplay = (value: string, prefix?: string, suffix?: string) => {
  if (!value) return "";

  const hasTrailingDecimal = value.endsWith(".");
  const [integerRaw, decimalRaw = ""] = value.split(".");
  const integerPart = normalizeInteger(integerRaw) || "0";
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decimalRaw) {
    return `${prefix ?? ""}${groupedInteger},${decimalRaw}${suffix ?? ""}`;
  }

  if (hasTrailingDecimal) {
    return `${prefix ?? ""}${groupedInteger},${suffix ?? ""}`;
  }

  return `${prefix ?? ""}${groupedInteger}${suffix ?? ""}`;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    {
      value,
      onValueChange,
      maxDecimals = 2,
      prefix,
      suffix,
      caretToEndOnFocus = false,
      onFocus,
      onMouseUp,
      ...props
    },
    ref
  ) {
    const moveCaretToEnd = (input: HTMLInputElement) => {
      const end = input.value.length;
      requestAnimationFrame(() => {
        try {
          input.setSelectionRange(end, end);
        } catch {
          // No-op: some input types/browsers may not support selection updates.
        }
      });
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={formatMoneyDisplay(value, prefix, suffix)}
        onChange={(event) => {
          onValueChange(normalizeMoneyInput(event.target.value, maxDecimals));
        }}
        onFocus={(event) => {
          onFocus?.(event);
          if (caretToEndOnFocus) {
            moveCaretToEnd(event.currentTarget);
          }
        }}
        onMouseUp={(event) => {
          onMouseUp?.(event);
          if (caretToEndOnFocus) {
            moveCaretToEnd(event.currentTarget);
          }
        }}
      />
    );
  }
);
