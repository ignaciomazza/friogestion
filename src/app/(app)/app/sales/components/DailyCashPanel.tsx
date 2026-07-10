"use client";

import type { FormEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import { formatQuantityInput, normalizeDecimalInput } from "@/lib/input-format";
import type { ProductOption, SaleRow } from "../types";
import { hasPositiveCatalogPrice } from "../utils";

type PaymentMethodOption = {
  id: string;
  name: string;
  type: string;
  requiresAccount: boolean;
  requiresApproval: boolean;
  requiresDoubleCheck: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
};

type CurrencyOption = {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  isDefault: boolean;
};

type ProductSearchOption = ProductOption & {
  purchaseCode?: string | null;
};

type DailyCashPanelProps = {
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRate: string | null;
  onSalesChanged: () => Promise<void> | void;
};

type AmountMode = "TOTAL" | "NET" | "TOTAL_UNIT" | "NET_UNIT";
type VatMode = "21" | "10.5" | "0" | "EXEMPT";

type DailyLineDraft = {
  localId: string;
  productId: string;
  productSearch: string;
  qty: string;
  amountMode: AmountMode;
  amount: string;
  taxRate: VatMode;
};

type EditLineDraft = {
  id: string;
  label: string;
  qty: string;
  amountMode: AmountMode;
  amount: string;
  taxRate: VatMode;
};

type DailySelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

type DailySelectProps<T extends string> = {
  value: T;
  options: Array<DailySelectOption<T>>;
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  direction?: "down" | "up";
};

function DailySelect<T extends string>({
  value,
  options,
  onValueChange,
  placeholder = "Seleccionar",
  disabled = false,
  compact = false,
  ariaLabel,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  optionClassName = "",
  direction = "down",
}: DailySelectProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabledOptions = useMemo(
    () =>
      options
        .map((option, index) => ({ option, index }))
        .filter((item) => !item.option.disabled),
    [options],
  );
  const defaultActiveIndex =
    selectedIndex >= 0 ? selectedIndex : enabledOptions[0]?.index ?? 0;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const openMenu = () => {
    setActiveIndex(defaultActiveIndex);
    setOpen(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    const currentEnabledIndex = enabledOptions.findIndex(
      (item) => item.index === activeIndex,
    );
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? direction === 1
          ? 0
          : enabledOptions.length - 1
        : (currentEnabledIndex + direction + enabledOptions.length) %
          enabledOptions.length;
    setActiveIndex(enabledOptions[nextEnabledIndex]?.index ?? activeIndex);
  };

  const selectOption = (option: DailySelectOption<T>) => {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  };
  const menuPosition = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        className={`input flex w-full min-w-0 items-center justify-between gap-2 text-left ${
          compact ? "min-h-9 py-1.5 text-xs" : "min-h-10"
        } ${buttonClassName}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActive(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActive(-1);
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            const option = options[activeIndex];
            if (option) selectOption(option);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className={`min-w-0 truncate ${selectedOption ? "" : "text-zinc-500"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={`${id}-options`}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute left-0 right-0 ${menuPosition} z-[220] max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_18px_32px_-22px_rgba(39,39,42,0.55)] ${menuClassName}`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected || isActive
                      ? "bg-sky-50 text-sky-950"
                      : "text-zinc-700 hover:bg-zinc-50"
                  } ${option.disabled ? "cursor-not-allowed opacity-50" : ""} ${optionClassName}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {isSelected ? <CheckIcon className="size-4 shrink-0" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const todayInputValue = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const readApiError = async (res: Response, fallback: string) => {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const moveCaretToEnd = (input: HTMLInputElement) => {
  const end = input.value.length;
  requestAnimationFrame(() => {
    try {
      input.setSelectionRange(end, end);
    } catch {
      // Some browsers can reject selection changes during input composition.
    }
  });
};

const resolveTotals = ({
  amount,
  amountMode,
  taxRate,
  qty,
}: {
  amount: number;
  amountMode: AmountMode;
  taxRate: number;
  qty: number;
}) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { net: 0, iva: 0, total: 0 };
  }
  const normalizedQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const amountBase =
    amountMode === "TOTAL_UNIT" || amountMode === "NET_UNIT"
      ? round2(amount * normalizedQty)
      : amount;
  const normalizedRate = Number.isFinite(taxRate) ? Math.max(taxRate, 0) : 0;
  if (normalizedRate <= 0) {
    const total = round2(amountBase);
    return { net: total, iva: 0, total };
  }
  if (amountMode === "NET" || amountMode === "NET_UNIT") {
    const net = round2(amountBase);
    const iva = round2(net * (normalizedRate / 100));
    return { net, iva, total: round2(net + iva) };
  }
  const total = round2(amountBase);
  const net = round2(total / (1 + normalizedRate / 100));
  return { net, iva: round2(total - net), total };
};

const createLine = (): DailyLineDraft => ({
  localId: Math.random().toString(36).slice(2),
  productId: "",
  productSearch: "",
  qty: "1",
  amountMode: "TOTAL",
  amount: "",
  taxRate: "21",
});

const taxRateFromVatMode = (value: VatMode) =>
  value === "EXEMPT" ? 0 : Number(value);

const lineTotals = (line: Pick<DailyLineDraft, "amount" | "amountMode" | "taxRate" | "qty">) =>
  resolveTotals({
    amount: Number(line.amount || 0),
    amountMode: line.amountMode,
    taxRate: taxRateFromVatMode(line.taxRate),
    qty: Number(line.qty || 0),
  });

type DailyAmountLine = Pick<
  DailyLineDraft,
  "amount" | "amountMode" | "taxRate" | "qty"
>;

const netUnitPriceFromLine = (line: DailyAmountLine) => {
  const qty = Number(line.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return round2(lineTotals(line).net / qty);
};

const moneyValueOrEmpty = (value: number) =>
  Number.isFinite(value) && value > 0 ? round2(value).toFixed(2) : "";

const netUnitInputValue = (line: DailyAmountLine) =>
  line.amountMode === "NET_UNIT"
    ? line.amount
    : moneyValueOrEmpty(netUnitPriceFromLine(line));

const totalInputValue = (line: DailyAmountLine) =>
  line.amountMode === "TOTAL"
    ? line.amount
    : moneyValueOrEmpty(lineTotals(line).total);

function DailyTotalsStrip({
  totals,
  className = "",
}: {
  totals: { net: number; iva: number; total: number };
  className?: string;
}) {
  const items = [
    { label: "Neto", value: totals.net },
    { label: "IVA", value: totals.iva },
    { label: "Total", value: totals.total },
  ];

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 tabular-nums ${className}`}
    >
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap"
        >
          <span>{item.label}</span>
          <strong className="text-zinc-900">
            {formatCurrencyARS(item.value)}
          </strong>
        </span>
      ))}
    </div>
  );
}

function DailySaleTotalsSummary({
  totals,
  className = "",
}: {
  totals: { net: number; iva: number; total: number };
  className?: string;
}) {
  return (
    <div
      className={`flex w-fit max-w-full items-center justify-end gap-3 rounded-xl bg-zinc-50 px-3 py-2 tabular-nums ${className}`}
    >
      <div className="space-y-0.5 text-xs text-zinc-600">
        <div className="flex min-w-[8.5rem] justify-between gap-3">
          <span>Neto</span>
          <strong className="text-zinc-900">
            {formatCurrencyARS(totals.net)}
          </strong>
        </div>
        <div className="flex min-w-[8.5rem] justify-between gap-3">
          <span>IVA</span>
          <strong className="text-zinc-900">
            {formatCurrencyARS(totals.iva)}
          </strong>
        </div>
      </div>
      <div className="h-9 w-px shrink-0 bg-zinc-200" />
      <div className="text-right">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Total
        </span>
        <strong className="block whitespace-nowrap text-base font-semibold text-zinc-950">
          {formatCurrencyARS(totals.total)}
        </strong>
      </div>
    </div>
  );
}

const formatProductLabel = (product: ProductSearchOption) =>
  [
    product.name,
    product.sku ? `Int. ${product.sku}` : null,
    product.purchaseCode ? `Compra ${product.purchaseCode}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

const invoiceLabel = (sale: SaleRow) => {
  const pointOfSale = sale.fiscalInvoicePointOfSale;
  const number = sale.fiscalInvoiceNumber;
  if (!pointOfSale && !number) return null;
  const voucher =
    pointOfSale && number ? `${pointOfSale}-${number}` : number ?? pointOfSale;
  return [sale.fiscalInvoiceType, voucher].filter(Boolean).join(" ");
};

const paymentSummary = (sale: SaleRow) => {
  const first = sale.payments?.[0];
  if (!first) return "Sin cobro visible";
  return first.accountName
    ? `${first.paymentMethodName} · ${first.accountName}`
    : first.paymentMethodName;
};

const itemTitle = (sale: SaleRow) => {
  const firstItem = sale.items?.[0];
  const firstName = firstItem?.productName ?? "Venta diaria";
  const itemCount = sale.items?.length ?? 0;
  return itemCount > 1 ? `${firstName} + ${itemCount - 1}` : firstName;
};

const vatOptions: Array<DailySelectOption<VatMode>> = [
  { value: "21", label: "IVA 21%" },
  { value: "10.5", label: "IVA 10.5%" },
  { value: "0", label: "Sin IVA" },
  { value: "EXEMPT", label: "Exento" },
];

export function DailyCashPanel({
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  onSalesChanged,
}: DailyCashPanelProps) {
  const defaultCurrency =
    currencies.find((currency) => currency.isDefault)?.code ??
    currencies[0]?.code ??
    "ARS";
  const defaultMethodId = paymentMethods[0]?.id ?? "";

  const [date] = useState(todayInputValue);
  const [lines, setLines] = useState<DailyLineDraft[]>(() => [createLine()]);
  const [openProductLineId, setOpenProductLineId] = useState<string | null>(null);
  const [productMatches, setProductMatches] = useState<ProductSearchOption[]>([]);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState(defaultMethodId);
  const [accountId, setAccountId] = useState("");
  const [dailySales, setDailySales] = useState<SaleRow[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "warning" | "error">(
    "success",
  );
  const [facturingSaleId, setFacturingSaleId] = useState<string | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRow | null>(null);
  const [editLines, setEditLines] = useState<EditLineDraft[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const selectedMethod = useMemo(
    () => paymentMethods.find((method) => method.id === paymentMethodId) ?? null,
    [paymentMethodId, paymentMethods],
  );
  const compatibleAccounts = useMemo(
    () => accounts.filter((account) => account.currencyCode === defaultCurrency),
    [accounts, defaultCurrency],
  );
  const paymentMethodOptions = useMemo(
    () =>
      paymentMethods.map((method) => ({
        value: method.id,
        label: method.name,
      })),
    [paymentMethods],
  );
  const accountOptions = useMemo(
    () =>
      compatibleAccounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    [compatibleAccounts],
  );
  const totals = useMemo(
    () =>
      lines.reduce(
        (sum, line) => {
          const current = lineTotals(line);
          return {
            net: sum.net + current.net,
            iva: sum.iva + current.iva,
            total: sum.total + current.total,
          };
        },
        { net: 0, iva: 0, total: 0 },
      ),
    [lines],
  );
  const editTotals = useMemo(
    () =>
      editLines.reduce(
        (sum, line) => {
          const current = lineTotals(line);
          return {
            net: sum.net + current.net,
            iva: sum.iva + current.iva,
            total: sum.total + current.total,
          };
        },
        { net: 0, iva: 0, total: 0 },
      ),
    [editLines],
  );
  const pendingToCloseCount = dailySales.filter(
    (sale) => sale.billingStatus === "TO_BILL",
  ).length;
  const dailyTotal = dailySales.reduce(
    (sum, sale) => sum + Number(sale.total ?? 0),
    0,
  );
  const openLine = lines.find((line) => line.localId === openProductLineId);

  const loadProducts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setProductMatches([]);
      return;
    }
    setIsProductLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "8",
        offset: "0",
        sort: "relevance",
        q: query.trim(),
      });
      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setProductMatches([]);
        return;
      }
      const data = (await res.json()) as { items?: ProductSearchOption[] };
      setProductMatches(data.items ?? []);
    } finally {
      setIsProductLoading(false);
    }
  }, []);

  const loadDailySales = useCallback(async () => {
    setIsLoadingSales(true);
    try {
      const params = new URLSearchParams({
        origin: "DAILY_CASH",
        dateFrom: date,
        dateTo: date,
        limit: "100",
        offset: "0",
        sort: "newest",
      });
      const res = await fetch(`/api/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: SaleRow[] };
      setDailySales(data.items ?? []);
    } finally {
      setIsLoadingSales(false);
    }
  }, [date]);

  useEffect(() => {
    loadDailySales().catch(() => undefined);
  }, [loadDailySales]);

  useEffect(() => {
    if (!openLine) return;
    const timeoutId = window.setTimeout(() => {
      loadProducts(openLine.productSearch).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [loadProducts, openLine]);

  useEffect(() => {
    if (!paymentMethodId && defaultMethodId) {
      setPaymentMethodId(defaultMethodId);
    }
  }, [defaultMethodId, paymentMethodId]);

  useEffect(() => {
    if (!selectedMethod?.requiresAccount) {
      setAccountId("");
      return;
    }
    if (accountId && compatibleAccounts.some((account) => account.id === accountId)) {
      return;
    }
    setAccountId(compatibleAccounts[0]?.id ?? "");
  }, [accountId, compatibleAccounts, selectedMethod]);

  const resetForm = () => {
    setLines([createLine()]);
    setOpenProductLineId(null);
    setProductMatches([]);
  };

  const refreshAfterChange = async () => {
    await loadDailySales();
    await onSalesChanged();
  };

  const updateLine = (
    localId: string,
    patch: Partial<Omit<DailyLineDraft, "localId">>,
  ) => {
    setLines((previous) =>
      previous.map((line) => {
        if (line.localId !== localId) return line;
        return {
          ...line,
          ...patch,
          ...(patch.productSearch !== undefined
            ? { productId: "" }
            : {}),
        };
      }),
    );
  };

  const updateLineNetUnit = (localId: string, value: string) => {
    setLines((previous) =>
      previous.map((line) =>
        line.localId === localId
          ? { ...line, amount: value, amountMode: "NET_UNIT" }
          : line,
      ),
    );
  };

  const updateLineTotal = (localId: string, value: string) => {
    setLines((previous) =>
      previous.map((line) =>
        line.localId === localId
          ? { ...line, amount: value, amountMode: "TOTAL" }
          : line,
      ),
    );
  };

  const addLine = () => setLines((previous) => [...previous, createLine()]);

  const removeLine = (localId: string) => {
    setLines((previous) =>
      previous.length === 1
        ? previous.map(() => createLine())
        : previous.filter((line) => line.localId !== localId),
    );
  };

  const selectProduct = (localId: string, product: ProductSearchOption) => {
    setLines((previous) =>
      previous.map((line) => {
        if (line.localId !== localId) return line;
        const hasCatalogPrice = hasPositiveCatalogPrice(product.price);
        const nextLine = {
          ...line,
          productId: product.id,
          productSearch: formatProductLabel(product),
          amountMode: hasCatalogPrice
            ? ("NET_UNIT" as AmountMode)
            : line.amountMode,
        };
        return {
          ...nextLine,
          amount: hasCatalogPrice
            ? (product.price ?? "")
            : line.amount,
        };
      }),
    );
    setOpenProductLineId(null);
    setProductMatches([]);
  };

  const updateEditLine = (
    id: string,
    patch: Partial<Omit<EditLineDraft, "id" | "label">>,
  ) => {
    setEditLines((previous) =>
      previous.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };

  const updateEditLineNetUnit = (id: string, value: string) => {
    updateEditLine(id, { amount: value, amountMode: "NET_UNIT" });
  };

  const updateEditLineTotal = (id: string, value: string) => {
    updateEditLine(id, { amount: value, amountMode: "TOTAL" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    if (!paymentMethodId) {
      setStatusTone("error");
      setStatus("Selecciona un metodo de pago.");
      return;
    }
    if (selectedMethod?.requiresAccount && !accountId) {
      setStatusTone("error");
      setStatus("Selecciona una cuenta.");
      return;
    }

    const payloadItems = lines.map((line) => ({
      productId: line.productId || undefined,
      description: line.productId ? undefined : line.productSearch.trim() || undefined,
      qty: Number(line.qty || 0),
      amount: Number(line.amount || 0),
      amountMode: line.amountMode,
      taxRate: taxRateFromVatMode(line.taxRate),
      includesVat: taxRateFromVatMode(line.taxRate) > 0,
    }));

    const invalidItem = payloadItems.some(
      (item) =>
        !Number.isFinite(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0,
    );
    if (invalidItem) {
      setStatusTone("error");
      setStatus("Revisa cantidad e importe en todos los items.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/sales/daily-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleDate: date,
          items: payloadItems,
          paymentMethodId,
          accountId: selectedMethod?.requiresAccount ? accountId : undefined,
          currencyCode: defaultCurrency,
          fxRateUsed: defaultCurrency === "ARS" ? undefined : Number(latestUsdRate ?? 0),
        }),
      });

      if (!res.ok) {
        setStatusTone("error");
        setStatus(await readApiError(res, "No se pudo guardar"));
        return;
      }

      resetForm();
      setStatusTone("success");
      setStatus("Venta diaria guardada y cobrada.");
      await refreshAfterChange();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoice = async (sale: SaleRow) => {
    setFacturingSaleId(sale.id);
    setStatus(null);
    try {
      const res = await fetch("/api/fiscal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.id }),
      });
      if (!res.ok) {
        setStatusTone("error");
        setStatus(await readApiError(res, "No se pudo facturar"));
        return;
      }
      setStatusTone("success");
      setStatus(`Venta ${sale.saleNumber ?? sale.id} facturada.`);
      await refreshAfterChange();
    } finally {
      setFacturingSaleId(null);
    }
  };

  const handleDelete = async (sale: SaleRow) => {
    if (sale.billingStatus === "BILLED") {
      setStatusTone("error");
      setStatus("No se puede anular una venta ya facturada desde caja diaria.");
      return;
    }
    if (!window.confirm("Anular esta venta diaria? Tambien se eliminara el cobro asociado.")) {
      return;
    }

    setDeletingSaleId(sale.id);
    setStatus(null);
    try {
      const receiptIds = Array.from(
        new Set((sale.payments ?? []).map((payment) => payment.receiptId)),
      );
      for (const receiptId of receiptIds) {
        const receiptRes = await fetch(
          `/api/receipts?id=${encodeURIComponent(receiptId)}`,
          { method: "DELETE" },
        );
        if (!receiptRes.ok) {
          setStatusTone("error");
          setStatus(await readApiError(receiptRes, "No se pudo eliminar el cobro"));
          return;
        }
      }

      const saleRes = await fetch(`/api/sales?id=${encodeURIComponent(sale.id)}`, {
        method: "DELETE",
      });
      if (!saleRes.ok) {
        setStatusTone("error");
        setStatus(await readApiError(saleRes, "No se pudo anular"));
        return;
      }

      setStatusTone("success");
      setStatus("Venta diaria anulada.");
      await refreshAfterChange();
    } finally {
      setDeletingSaleId(null);
    }
  };

  const openEdit = (sale: SaleRow) => {
    const items = sale.items ?? [];
    if (!items.length) return;
    setEditingSale(sale);
    setEditLines(
      items
        .filter((item) => item.id)
        .map((item) => {
          const net = Number(item.total ?? 0);
          const tax = Number(item.taxAmount ?? 0);
      const taxRate = Number(item.taxRate ?? 0);
      const normalizedTaxRate: VatMode =
        Math.abs(taxRate - 10.5) < 0.01 ? "10.5" : taxRate > 0 ? "21" : "0";
          return {
            id: item.id as string,
            label: item.productName || item.description || "Item",
            qty: item.qty || "1",
            amountMode: "TOTAL",
            amount: round2(net + tax).toFixed(2),
            taxRate: normalizedTaxRate,
          };
        }),
    );
  };

  const handleEdit = async () => {
    if (!editingSale || !editLines.length) return;
    const payloadItems = editLines.map((line) => ({
      id: line.id,
      qty: Number(line.qty || 0),
      amount: Number(line.amount || 0),
      amountMode: line.amountMode,
      taxRate: taxRateFromVatMode(line.taxRate),
      includesVat: taxRateFromVatMode(line.taxRate) > 0,
    }));
    const invalidItem = payloadItems.some(
      (item) =>
        !Number.isFinite(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0,
    );
    if (invalidItem) {
      setStatusTone("error");
      setStatus("Revisa cantidad e importe en todos los items.");
      return;
    }

    setIsEditing(true);
    try {
      const res = await fetch("/api/sales/daily-cash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: editingSale.id,
          items: payloadItems,
        }),
      });
      if (!res.ok) {
        setStatusTone("error");
        setStatus(await readApiError(res, "No se pudo editar"));
        return;
      }
      setEditingSale(null);
      setEditLines([]);
      setStatusTone("success");
      setStatus("Venta diaria actualizada.");
      await refreshAfterChange();
    } finally {
      setIsEditing(false);
    }
  };

  const handleCloseCash = async () => {
    setIsClosing(true);
    setStatus(null);
    try {
      const res = await fetch("/api/sales/daily-cash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        setStatusTone("error");
        setStatus(await readApiError(res, "No se pudo cerrar caja"));
        return;
      }
      const data = (await res.json()) as { closed?: number };
      setShowCloseModal(false);
      setStatusTone("success");
      setStatus(`Caja cerrada. ${data.closed ?? 0} ventas quedaron como registro interno.`);
      await refreshAfterChange();
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-5">
      <form className="card relative z-20 space-y-4" onSubmit={handleSubmit}>
        <div className="divide-y divide-zinc-200">
          {lines.map((line, index) => {
            const currentTotals = lineTotals(line);
            return (
              <div
                key={line.localId}
                className="py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
                  <label className="field-stack min-w-[13rem] flex-1">
                    <span className="input-label">
                      {index === 0 ? "Producto/concepto" : `Item ${index + 1}`}
                    </span>
                    <div className="relative">
                      <input
                        className="input w-full"
                        value={line.productSearch}
                        onChange={(event) => {
                          updateLine(line.localId, {
                            productSearch: event.target.value,
                          });
                          setOpenProductLineId(line.localId);
                        }}
                        onFocus={() => setOpenProductLineId(line.localId)}
                        onBlur={() =>
                          window.setTimeout(() => setOpenProductLineId(null), 120)
                        }
                        placeholder="Opcional"
                      />
                      {openProductLineId === line.localId ? (
                        <div className="absolute z-[150] mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-zinc-200 bg-white p-2 text-sm shadow-xl shadow-zinc-900/10">
                          {isProductLoading ? (
                            <p className="px-3 py-2 text-xs text-zinc-500">
                              Buscando...
                            </p>
                          ) : productMatches.length ? (
                            productMatches.map((product) => (
                              <button
                                key={product.id}
                                type="button"
                                className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-sky-50"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectProduct(line.localId, product)}
                              >
                                <span className="font-medium text-zinc-900">
                                  {product.name}
                                </span>
                                <span className="mt-0.5 block text-xs text-zinc-500">
                                  {[product.sku, product.brand, product.model]
                                    .filter(Boolean)
                                    .join(" - ") || "Producto"}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-zinc-500">
                              Se guardara como concepto manual.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label className="field-stack w-[4.75rem] shrink-0">
                    <span className="input-label">Cant.</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                      value={formatQuantityInput(line.qty)}
                      placeholder="1"
                      onFocus={(event) => moveCaretToEnd(event.currentTarget)}
                      onMouseUp={(event) => moveCaretToEnd(event.currentTarget)}
                      onChange={(event) =>
                        updateLine(line.localId, {
                          qty: normalizeDecimalInput(event.target.value, 3),
                        })
                      }
                    />
                  </label>

                  <label className="field-stack w-[8.25rem] shrink-0">
                    <span className="input-label">Neto unit.</span>
                    <MoneyInput
                      className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                      value={netUnitInputValue(line)}
                      onValueChange={(value) =>
                        updateLineNetUnit(line.localId, value)
                      }
                      prefix="$"
                      placeholder="0,00"
                      caretToEndOnFocus
                    />
                  </label>

                  <label className="field-stack w-[8.25rem] shrink-0">
                    <span className="input-label">Total</span>
                    <MoneyInput
                      className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                      value={totalInputValue(line)}
                      onValueChange={(value) =>
                        updateLineTotal(line.localId, value)
                      }
                      prefix="$"
                      placeholder="0,00"
                      caretToEndOnFocus
                    />
                  </label>

                  <div className="field-stack w-[6.75rem] shrink-0">
                    <span className="input-label">IVA</span>
                    <DailySelect
                      value={line.taxRate}
                      options={vatOptions}
                      onValueChange={(value) =>
                        updateLine(line.localId, {
                          taxRate: value,
                        })
                      }
                      buttonClassName="px-2"
                      menuClassName="min-w-32"
                      ariaLabel="IVA"
                    />
                  </div>

                  <div className="flex w-9 shrink-0 items-end justify-end pt-6">
                    <button
                      type="button"
                      className="btn h-9 w-9 justify-center border-rose-200 p-0 text-rose-700 hover:bg-rose-50"
                      onClick={() => removeLine(line.localId)}
                      disabled={isSubmitting}
                      aria-label="Quitar item"
                      title="Quitar item"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </div>

                <DailyTotalsStrip
                  totals={currentTotals}
                  className="ml-auto mr-11 mt-2 w-fit max-w-[calc(100%-2.75rem)] justify-end"
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-sky text-xs"
            onClick={addLine}
            disabled={isSubmitting}
          >
            <PlusIcon className="size-4" />
            Agregar item
          </button>
        </div>

        <div className="subtle-divider" />

        <div className="grid gap-3 lg:grid-cols-[minmax(12rem,16rem)_minmax(12rem,16rem)_1fr_auto] lg:items-end">
          <label className="field-stack">
            <span className="input-label">Metodo</span>
            <DailySelect
              value={paymentMethodId}
              options={paymentMethodOptions}
              onValueChange={setPaymentMethodId}
              placeholder="Seleccionar"
              ariaLabel="Metodo de pago"
              menuClassName="min-w-56"
            />
          </label>

          {selectedMethod?.requiresAccount ? (
            <label className="field-stack">
              <span className="input-label">Cuenta</span>
              <DailySelect
                value={accountId}
                options={accountOptions}
                onValueChange={setAccountId}
                placeholder="Seleccionar"
                ariaLabel="Cuenta"
                menuClassName="min-w-56"
              />
            </label>
          ) : (
            <div className="hidden lg:block" />
          )}

          <DailySaleTotalsSummary
            totals={totals}
            className="ml-auto lg:justify-self-end"
          />

          <button
            type="submit"
            className="btn btn-emerald h-11 w-full justify-center lg:w-auto"
            disabled={isSubmitting}
          >
            <CheckIcon className="size-4" />
            {isSubmitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>

      <div className="card relative z-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-title">Ventas del dia</h3>
            <p className="section-subtitle mt-1">
              {isLoadingSales
                ? "Cargando ventas..."
                : `${dailySales.length} ventas · ${formatCurrencyARS(dailyTotal)}`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sky"
            onClick={() => setShowCloseModal(true)}
            disabled={!pendingToCloseCount || isClosing}
          >
            Cerrar caja
          </button>
        </div>

        {status ? (
          <p
            className={`text-sm font-medium ${
              statusTone === "success"
                ? "text-emerald-700"
                : statusTone === "warning"
                  ? "text-amber-700"
                  : "text-rose-700"
            }`}
          >
            {status}
          </p>
        ) : null}

        <div className="space-y-2">
          {dailySales.length ? (
            dailySales.map((sale) => {
              const fiscalLabel = invoiceLabel(sale);
              const isBilled = sale.billingStatus === "BILLED";
              const isInternal = sale.billingStatus === "NOT_BILLED";

              return (
                <div
                  key={sale.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-3"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_10rem_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {itemTitle(sale)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Venta {sale.saleNumber ?? "-"} · {paymentSummary(sale)}
                      </p>
                    </div>
                    <div className="text-xs text-zinc-600 lg:text-right">
                      <p>Neto {formatCurrencyARS(sale.subtotal ?? 0)}</p>
                      <p>IVA {formatCurrencyARS(sale.taxes ?? 0)}</p>
                    </div>
                    <div className="text-sm font-semibold text-zinc-900 lg:text-right">
                      {formatCurrencyARS(sale.total ?? 0)}
                    </div>
                    <div className="text-xs lg:text-right">
                      {isBilled ? (
                        <span className="pill border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                          {fiscalLabel ? `Facturada ${fiscalLabel}` : "Facturada"}
                        </span>
                      ) : isInternal ? (
                        <span className="pill border border-zinc-200 bg-zinc-50 px-2 py-1 font-semibold text-zinc-700">
                          Registro interno
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sky h-9 text-xs"
                          onClick={() => void handleInvoice(sale)}
                          disabled={facturingSaleId === sale.id}
                        >
                          <DocumentTextIcon className="size-4" />
                          {facturingSaleId === sale.id ? "Facturando..." : "Facturar"}
                        </button>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn h-9 w-9 justify-center p-0"
                        onClick={() => openEdit(sale)}
                        disabled={isBilled}
                        aria-label="Editar venta diaria"
                        title="Editar"
                      >
                        <PencilSquareIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="btn h-9 w-9 justify-center border-rose-200 p-0 text-rose-700 hover:bg-rose-50"
                        onClick={() => void handleDelete(sale)}
                        disabled={isBilled || deletingSaleId === sale.id}
                        aria-label="Anular venta diaria"
                        title="Anular"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
              Todavia no hay ventas cargadas para este dia.
            </p>
          )}
        </div>
      </div>

      {editingSale ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center">
          <div className="card max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-zinc-900">
                  Editar venta {editingSale.saleNumber ?? "-"}
                </h4>
                <p className="text-xs text-zinc-500">
                  Solo disponible antes de facturar.
                </p>
              </div>
              <button
                type="button"
                className="btn h-9 w-9 justify-center p-0"
                onClick={() => {
                  setEditingSale(null);
                  setEditLines([]);
                }}
                aria-label="Cerrar"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>

            <div className="divide-y divide-zinc-200">
              {editLines.map((line, index) => {
                const currentTotals = lineTotals(line);
                return (
                  <div
                    key={line.id}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
                      <div className="field-stack min-w-[13rem] flex-1">
                        <span className="input-label">Item {index + 1}</span>
                        <div className="input flex items-center truncate bg-zinc-50 text-sm text-zinc-700">
                          {line.label}
                        </div>
                      </div>
                      <label className="field-stack w-[4.75rem] shrink-0">
                        <span className="input-label">Cant.</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                          value={formatQuantityInput(line.qty)}
                          placeholder="1"
                          onFocus={(event) => moveCaretToEnd(event.currentTarget)}
                          onMouseUp={(event) => moveCaretToEnd(event.currentTarget)}
                          onChange={(event) =>
                            updateEditLine(line.id, {
                              qty: normalizeDecimalInput(event.target.value, 3),
                            })
                          }
                        />
                      </label>
                      <label className="field-stack w-[8.25rem] shrink-0">
                        <span className="input-label">Neto unit.</span>
                        <MoneyInput
                          className="input h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                          value={netUnitInputValue(line)}
                          onValueChange={(value) =>
                            updateEditLineNetUnit(line.id, value)
                          }
                          prefix="$"
                          caretToEndOnFocus
                        />
                      </label>
                      <label className="field-stack w-[8.25rem] shrink-0">
                        <span className="input-label">Total</span>
                        <MoneyInput
                          className="input h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                          value={totalInputValue(line)}
                          onValueChange={(value) =>
                            updateEditLineTotal(line.id, value)
                          }
                          prefix="$"
                          caretToEndOnFocus
                        />
                      </label>
                      <div className="field-stack w-[6.75rem] shrink-0">
                        <span className="input-label">IVA</span>
                        <DailySelect
                          value={line.taxRate}
                          options={vatOptions}
                          onValueChange={(value) =>
                            updateEditLine(line.id, {
                              taxRate: value,
                            })
                          }
                          buttonClassName="px-2"
                          menuClassName="min-w-32"
                          ariaLabel="IVA"
                        />
                      </div>
                    </div>

                    <DailyTotalsStrip
                      totals={currentTotals}
                      className="ml-auto mt-2 w-fit max-w-full justify-end"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <DailySaleTotalsSummary
                totals={editTotals}
                className="ml-auto"
              />

              <button
                type="button"
                className="btn btn-emerald w-full sm:w-auto"
                onClick={() => void handleEdit()}
                disabled={isEditing}
              >
                <CheckIcon className="size-4" />
                {isEditing ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseModal ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center">
          <div className="card w-full max-w-md space-y-4 p-4">
            <h4 className="text-base font-semibold text-zinc-900">
              Cerrar caja diaria
            </h4>
            <p className="text-sm text-zinc-600">
              Las {pendingToCloseCount} ventas del dia que no esten facturadas
              quedaran como registro interno. Las ventas ya facturadas no se
              modifican.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn"
                onClick={() => setShowCloseModal(false)}
                disabled={isClosing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-emerald"
                onClick={() => void handleCloseCash()}
                disabled={isClosing}
              >
                {isClosing ? "Cerrando..." : "Cerrar caja"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
