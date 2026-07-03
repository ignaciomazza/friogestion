"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import {
  buildAdjustedTotalsFromRates,
  buildTotalsFromRates,
} from "@/lib/afip/totals";
import { cn } from "@/lib/cn";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  normalizeCustomerFiscalTaxProfile,
  requiresRecipientTaxIdForFiscalTaxProfile,
  resolveInvoiceTypeFromFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import { formatCurrencyARS } from "@/lib/format";
import {
  formatPercentInput,
  formatQuantityInput,
  normalizeDecimalInput,
} from "@/lib/input-format";
import {
  calculateSaleAdjustment,
  getAdjustmentLabel,
  isCardInterestAdjustment,
  isPercentAdjustment,
  isSubtotalDiscountAdjustment,
  isTotalDiscountAdjustment,
} from "@/lib/sale-adjustments";
import type { CustomerOption, ProductOption, SaleRow } from "../types";
import { ReceiptForm } from "./ReceiptForm";

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

type SaleLineDraft = {
  localId: string;
  productId: string;
  productSearch: string;
  qty: string;
  amountMode: AmountMode;
  amount: string;
  taxRate: VatMode;
};

type ProductSearchOption = ProductOption & {
  purchaseCode?: string | null;
  isActive?: boolean;
};

type NewSaleFormProps = {
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRate: string | null;
  onSaleCreated: () => Promise<void> | void;
};

const TAX_RATE = "21";
type AmountMode = "TOTAL" | "NET" | "TOTAL_UNIT" | "NET_UNIT";
type VatMode = "21" | "10.5" | "0" | "EXEMPT";

type SaleSelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

type EditableInvoiceItem = {
  id: string;
  productName: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};

type InvoiceDraftResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      itemsTaxRates: Array<{ saleItemId: string; rate: number }>;
      fiscalTotals: ReturnType<typeof buildAdjustedTotalsFromRates>;
      adjustmentTotal: number;
    };

type InvoiceResolution =
  | {
      type: "USE_ISSUE_DATE";
      issueDate: string;
      title: string;
      description: string;
      primaryActionLabel: string;
    }
  | {
      type: "RECALCULATE_FISCAL_TOTALS";
      title: string;
      description: string;
      primaryActionLabel: string;
    };

type InvoiceApiErrorPayload = {
  error?: string;
  resolution?: unknown;
};

type IssuedInvoicePayload = {
  id: string;
  type: string | null;
  pointOfSale: string | null;
  number: string | null;
  cae: string | null;
  issuedAt: string | null;
  createdAt: string | null;
};

type SaleSelectProps<T extends string> = {
  value: T;
  options: Array<SaleSelectOption<T>>;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  buttonClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
};

const SALE_TAX_RATE_OPTIONS: Array<SaleSelectOption<VatMode>> = [
  { value: "21", label: "IVA 21" },
  { value: "10.5", label: "IVA 10,5" },
  { value: "0", label: "Sin IVA" },
  { value: "EXEMPT", label: "Exento" },
];

const SALE_AMOUNT_MODE_OPTIONS: Array<SaleSelectOption<AmountMode>> = [
  { value: "TOTAL", label: "Total" },
  { value: "NET", label: "Neto" },
  { value: "TOTAL_UNIT", label: "Total Unitario" },
  { value: "NET_UNIT", label: "Neto Unitario" },
];

const CONSUMER_FINAL_THRESHOLD = 10_000_000;
const QUEUE_POLL_ATTEMPTS = 90;
const QUEUE_POLL_INTERVAL_MS = 1000;
const ALLOWED_IVA_RATES = new Set<number>([0, 2.5, 5, 10.5, 21, 27]);

function SaleSelect<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  buttonClassName = "",
  menuClassName = "",
  optionClassName = "",
}: SaleSelectProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? null;

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

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className={`input flex min-h-10 w-full min-w-0 items-center justify-between gap-2 text-left ${buttonClassName}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="min-w-0 truncate">
          {selectedOption?.label ?? "Seleccionar"}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div
          id={`${id}-options`}
          role="listbox"
          className={`absolute left-0 right-0 top-full z-[90] mt-2 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_18px_32px_-22px_rgba(39,39,42,0.55)] ${menuClassName}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? "bg-sky-50 text-sky-950"
                    : "text-zinc-700 hover:bg-zinc-50"
                } ${
                  option.disabled ? "cursor-not-allowed opacity-50" : ""
                } ${optionClassName}`}
                onClick={() => {
                  if (option.disabled) return;
                  onValueChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected ? <CheckIcon className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const normalizeTaxId = (value?: string | null) =>
  (value ?? "").replace(/\D/g, "");

const createLine = (): SaleLineDraft => ({
  localId: Math.random().toString(36).slice(2),
  productId: "",
  productSearch: "",
  qty: "1",
  amountMode: "TOTAL",
  amount: "",
  taxRate: TAX_RATE,
});

const lineDescription = (line: SaleLineDraft) => line.productSearch.trim();

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const cleanInvoiceErrorMessage = (value: unknown) => {
  const message =
    typeof value === "string" && value.trim()
      ? value.trim()
      : "No se pudo emitir la factura.";
  const lower = message.toLowerCase();
  if (
    lower.includes("feparam") ||
    lower.includes("fep") ||
    lower.includes("soap") ||
    lower.includes("wsfe") ||
    lower.includes("exception")
  ) {
    return "ARCA rechazo la solicitud. Revisa los datos de la factura e intenta nuevamente.";
  }
  return message.replace(/AFIP/g, "ARCA");
};

function isInvoiceResolution(value: unknown): value is InvoiceResolution {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const hasBaseShape =
    typeof record.title === "string" &&
    typeof record.description === "string" &&
    typeof record.primaryActionLabel === "string";
  if (!hasBaseShape) return false;
  if (record.type === "RECALCULATE_FISCAL_TOTALS") return true;
  return record.type === "USE_ISSUE_DATE" && typeof record.issueDate === "string";
}

const taxRateFromVatMode = (value: VatMode) =>
  value === "EXEMPT" ? 0 : Number(value);

const resolveLineTotals = ({
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

const lineTotals = (
  line: Pick<SaleLineDraft, "amount" | "amountMode" | "taxRate" | "qty">,
) =>
  resolveLineTotals({
    amount: Number(line.amount || 0),
    amountMode: line.amountMode,
    taxRate: taxRateFromVatMode(line.taxRate),
    qty: Number(line.qty || 0),
  });

const amountModeInputLabel = (mode: AmountMode) => {
  if (mode === "NET") return "Neto";
  if (mode === "NET_UNIT") return "Neto unit.";
  if (mode === "TOTAL_UNIT") return "Total unit.";
  return "Total";
};

const suggestedProductAmount = (
  productPrice: string | null,
  line: SaleLineDraft,
) => {
  const netUnit = Number(productPrice ?? 0);
  if (!Number.isFinite(netUnit) || netUnit <= 0) return "";
  const qty = Number(line.qty || 0);
  const normalizedQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const rate = taxRateFromVatMode(line.taxRate) / 100;
  if (line.amountMode === "NET_UNIT") return round2(netUnit).toFixed(2);
  if (line.amountMode === "TOTAL_UNIT") {
    return round2(netUnit * (1 + rate)).toFixed(2);
  }
  if (line.amountMode === "NET") {
    return round2(netUnit * normalizedQty).toFixed(2);
  }
  return round2(netUnit * normalizedQty * (1 + rate)).toFixed(2);
};

const netUnitPriceFromLine = (line: SaleLineDraft) => {
  const qty = Number(line.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return round2(lineTotals(line).net / qty);
};

function SaleLineTotalsStrip({
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

function FiscalAmountItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-900">
        {formatCurrencyARS(value.toFixed(2))}
      </p>
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

const readApiError = async (res: Response, fallback: string) => {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
};

export function NewSaleForm({
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  onSaleCreated,
}: NewSaleFormProps) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null);
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [isResolvingConsumerFinal, setIsResolvingConsumerFinal] =
    useState(false);

  const [saleDate, setSaleDate] = useState(todayInputValue);
  const [lines, setLines] = useState<SaleLineDraft[]>(() => [createLine()]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productMatches, setProductMatches] = useState<ProductSearchOption[]>(
    [],
  );
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [extraType, setExtraType] = useState("NONE");
  const [extraValue, setExtraValue] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "warning" | "error">(
    "success",
  );
  const [createdSale, setCreatedSale] = useState<SaleRow | null>(null);
  const [flowStep, setFlowStep] = useState<
    "receipt" | "invoice" | "invoiceForm"
  >("receipt");
  const [isFacturing, setIsFacturing] = useState(false);
  const [isUpdatingBillingStatus, setIsUpdatingBillingStatus] = useState(false);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<"A" | "B">(
    "B",
  );
  const [invoiceForm, setInvoiceForm] = useState({
    requiresIncomeTaxDeduction: false,
  });
  const [editableInvoiceItems, setEditableInvoiceItems] = useState<
    EditableInvoiceItem[]
  >([]);
  const [isSavingInvoiceSale, setIsSavingInvoiceSale] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
  const [invoiceResolution, setInvoiceResolution] =
    useState<InvoiceResolution | null>(null);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotals(line).net, 0),
    [lines],
  );
  const taxes = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotals(line).iva, 0),
    [lines],
  );
  const adjustment = useMemo(
    () =>
      calculateSaleAdjustment({
        subtotal,
        taxes,
        type: extraType === "NONE" ? null : extraType,
        value: Number(extraValue || 0),
      }),
    [extraType, extraValue, subtotal, taxes],
  );
  const extraAmount = adjustment.amount;
  const total = subtotal + taxes + extraAmount;
  const adjustmentMode = isCardInterestAdjustment(extraType)
    ? "CARD_INTEREST"
    : isSubtotalDiscountAdjustment(extraType)
      ? "DISCOUNT_SUBTOTAL"
      : isTotalDiscountAdjustment(extraType)
        ? "DISCOUNT_TOTAL"
        : extraType === "PERCENT" || extraType === "FIXED"
          ? "SURCHARGE"
          : "NONE";
  const isPercentExtra = isPercentAdjustment(extraType);
  const extraSummaryLabel = getAdjustmentLabel(extraType, extraAmount);
  const nextTypeForUnit = (unit: "PERCENT" | "FIXED") => {
    if (adjustmentMode === "CARD_INTEREST") {
      return unit === "PERCENT" ? "CARD_INTEREST_PERCENT" : "CARD_INTEREST_FIXED";
    }
    if (adjustmentMode === "DISCOUNT_SUBTOTAL") {
      return unit === "PERCENT" ? "DISCOUNT_PERCENT" : "DISCOUNT_FIXED";
    }
    if (adjustmentMode === "DISCOUNT_TOTAL") {
      return unit === "PERCENT"
        ? "DISCOUNT_TOTAL_PERCENT"
        : "DISCOUNT_TOTAL_FIXED";
    }
    return unit === "PERCENT" ? "PERCENT" : "FIXED";
  };

  const invoicePreviewItems = editableInvoiceItems.map((item) => {
    const qty = Number(item.qty ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const base = round2(qty * unitPrice);
    const taxRate = Number(item.taxRate ?? 0);
    const iva = round2(base * (taxRate / 100));
    const lineTotal = round2(base + iva);
    return {
      id: item.id,
      productName: item.productName,
      qty,
      unitPrice,
      taxRate,
      base,
      iva,
      lineTotal,
    };
  });
  const invoicePreviewSubtotal = round2(
    invoicePreviewItems.reduce((sum, item) => sum + item.base, 0),
  );
  const invoicePreviewIva = round2(
    invoicePreviewItems.reduce((sum, item) => sum + item.iva, 0),
  );
  const invoiceAdjustment = calculateSaleAdjustment({
    subtotal: invoicePreviewSubtotal,
    taxes: invoicePreviewIva,
    type: createdSale?.extraType ?? null,
    value: Number(createdSale?.extraValue ?? 0),
  });
  const invoicePreviewExtraAmount = invoiceAdjustment.amount;
  const invoicePreviewChargesTotal = round2(
    Number(createdSale?.chargesTotal ?? 0),
  );
  const invoicePreviewTotal = round2(
    invoicePreviewSubtotal +
      invoicePreviewIva +
      invoicePreviewExtraAmount +
      invoicePreviewChargesTotal,
  );
  const invoiceTotal = invoicePreviewTotal;
  const customerFiscalTaxProfile = normalizeCustomerFiscalTaxProfile(
    createdSale?.customerFiscalTaxProfile ?? null,
  );
  const recommendedInvoiceType = resolveInvoiceTypeFromFiscalTaxProfile(
    customerFiscalTaxProfile,
  );
  const resolvedInvoiceType = selectedInvoiceType;
  const isInvoiceConsumerFinal =
    customerFiscalTaxProfile === "CONSUMIDOR_FINAL" ||
    (!customerFiscalTaxProfile &&
      (createdSale?.customerType ?? "CONSUMER_FINAL") === "CONSUMER_FINAL");
  const requiresInvoiceIdentification =
    isInvoiceConsumerFinal &&
    (invoiceTotal >= CONSUMER_FINAL_THRESHOLD ||
      invoiceForm.requiresIncomeTaxDeduction);
  const requiresProfileTaxId =
    requiresRecipientTaxIdForFiscalTaxProfile(customerFiscalTaxProfile);
  const hasRecipientDoc =
    normalizeTaxId(createdSale?.customerTaxId).length === 11;
  const recipientDocumentLabel = hasRecipientDoc
    ? `CUIT ${createdSale?.customerTaxId}`
    : isInvoiceConsumerFinal
      ? "Consumidor final sin CUIT"
      : "Sin CUIT cargado";
  const customerFiscalTaxProfileLabel = customerFiscalTaxProfile
    ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[customerFiscalTaxProfile]
    : "Sin definir";
  const shouldShowDeductionToggle = !(
    isInvoiceConsumerFinal && !hasRecipientDoc
  );
  const invoiceRecipientRequirementMessage = !hasRecipientDoc
    ? resolvedInvoiceType === "A"
      ? "Factura A requiere CUIT valido del cliente."
      : requiresInvoiceIdentification
        ? "Por monto o deduccion, este comprobante necesita CUIT del receptor."
        : requiresProfileTaxId
          ? "Esta condicion fiscal requiere CUIT valido para informar correctamente el receptor en ARCA."
          : null
    : null;
  const fiscalAdjustmentTotal = round2(
    invoicePreviewTotal -
      round2(invoicePreviewSubtotal + invoicePreviewIva + invoicePreviewChargesTotal),
  );
  const fiscalAdjustmentLabel = getAdjustmentLabel(
    createdSale?.extraType,
    fiscalAdjustmentTotal,
  );
  const hasRegularSurchargeAdjustment =
    Boolean(createdSale) &&
    fiscalAdjustmentTotal > 0 &&
    (createdSale?.extraType === "PERCENT" || createdSale?.extraType === "FIXED");

  const hasEditableInvoiceChanges = useMemo(() => {
    if (!createdSale) return false;
    const originalItems = (createdSale.items ?? []).filter(
      (
        item,
      ): item is NonNullable<SaleRow["items"]>[number] & { id: string } =>
        Boolean(item.id),
    );
    if (originalItems.length !== editableInvoiceItems.length) return false;
    return editableInvoiceItems.some((item) => {
      const original = originalItems.find((candidate) => candidate.id === item.id);
      if (!original) return false;
      return round2(Number(original.unitPrice ?? 0)) !== round2(Number(item.unitPrice ?? 0));
    });
  }, [createdSale, editableInvoiceItems]);

  const buildInvoiceDraft = (): InvoiceDraftResult => {
    if (!createdSale) {
      return { ok: false, error: "No hay venta seleccionada para facturar." };
    }
    if (!Number.isFinite(invoiceTotal) || invoiceTotal <= 0) {
      return { ok: false, error: "No se pudo calcular totales de la venta." };
    }
    if (resolvedInvoiceType === "A" && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Factura A requiere CUIT valido del cliente. Actualizalo en Clientes antes de emitir.",
      };
    }
    if (requiresProfileTaxId && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Esta condicion fiscal requiere CUIT valido del cliente. Actualizalo antes de emitir.",
      };
    }
    if (requiresInvoiceIdentification && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Por monto o deduccion corresponde identificar al receptor. Carga CUIT del cliente para facturar.",
      };
    }

    let hasInvalidTaxRate = false;
    const fiscalEntries: Array<{ base: number; rate: number }> = [];
    const itemsTaxRates = invoicePreviewItems
      .map((item) => {
        const rate = Number(item.taxRate ?? 0);
        if (!Number.isFinite(rate) || !ALLOWED_IVA_RATES.has(rate)) {
          hasInvalidTaxRate = true;
          return null;
        }
        const base = Number(item.base ?? 0);
        if (!Number.isFinite(base) || base < 0) {
          hasInvalidTaxRate = true;
          return null;
        }
        fiscalEntries.push({ base, rate });
        return { saleItemId: item.id, rate };
      })
      .filter(
        (item): item is { saleItemId: string; rate: number } => item !== null,
      );

    if (hasInvalidTaxRate) {
      return {
        ok: false,
        error:
          "La venta tiene alicuotas de IVA invalidas. Corrigela antes de facturar.",
      };
    }
    if (!itemsTaxRates.length) {
      return {
        ok: false,
        error:
          "La venta no tiene alicuotas de IVA por item. Revisala antes de facturar.",
      };
    }

    try {
      const baseTotals = buildTotalsFromRates(fiscalEntries);
      const adjustmentTotal = round2(invoiceTotal - baseTotals.total);
      const fiscalTotals = buildAdjustedTotalsFromRates(
        fiscalEntries,
        adjustmentTotal,
      );
      return { ok: true, itemsTaxRates, fiscalTotals, adjustmentTotal };
    } catch {
      return {
        ok: false,
        error:
          "No se pudieron calcular totales fiscales validos para esta venta.",
      };
    }
  };

  const invoiceDraftPreview = createdSale ? buildInvoiceDraft() : null;
  const fiscalPreview =
    invoiceDraftPreview?.ok === true ? invoiceDraftPreview.fiscalTotals : null;

  const loadCustomers = useCallback(async (query: string) => {
    setIsCustomerLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "8",
        offset: "0",
        sort: "az",
      });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/customers?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setCustomerMatches([]);
        return;
      }
      const data = (await res.json()) as { items?: CustomerOption[] };
      setCustomerMatches(data.items ?? []);
    } finally {
      setIsCustomerLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!isCustomerOpen) return;
    const timeoutId = window.setTimeout(() => {
      loadCustomers(customerSearch).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [customerSearch, isCustomerOpen, loadCustomers]);

  useEffect(() => {
    if (openProductIndex === null) return;
    const query = lines[openProductIndex]?.productSearch ?? "";
    const timeoutId = window.setTimeout(() => {
      loadProducts(query).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [lines, loadProducts, openProductIndex]);

  const resetForm = () => {
    setCustomerSearch("");
    setCustomerId("");
    setSelectedCustomer(null);
    setSaleDate(todayInputValue());
    setLines([createLine()]);
    setExtraType("NONE");
    setExtraValue("");
    setOpenProductIndex(null);
    setProductMatches([]);
  };

  const selectCustomer = (customer: CustomerOption) => {
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    setCustomerSearch(customer.displayName);
    setIsCustomerOpen(false);
  };

  const resolveConsumerFinal = async () => {
    setIsResolvingConsumerFinal(true);
    setStatus(null);
    try {
      const res = await fetch("/api/customers/consumer-final", {
        method: "POST",
      });
      if (!res.ok) {
        setStatusTone("error");
        setStatus(await readApiError(res, "No se pudo resolver consumidor final"));
        return;
      }
      const customer = (await res.json()) as CustomerOption;
      selectCustomer(customer);
    } finally {
      setIsResolvingConsumerFinal(false);
    }
  };

  const toggleConsumerFinal = () => {
    if (selectedCustomer?.type === "CONSUMER_FINAL") {
      setCustomerSearch("");
      setCustomerId("");
      setSelectedCustomer(null);
      return;
    }
    void resolveConsumerFinal();
  };

  const updateLine = (
    index: number,
    field: keyof SaleLineDraft,
    value: string,
  ) => {
    setLines((previous) =>
      previous.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
              ...(field === "productSearch" ? { productId: "" } : {}),
            }
          : line,
      ),
    );
  };

  const selectProduct = (index: number, product: ProductSearchOption) => {
    setLines((previous) =>
      previous.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              productId: product.id,
              productSearch: formatProductLabel(product),
              amount: suggestedProductAmount(product.price ?? null, line),
            }
          : line,
      ),
    );
    setOpenProductIndex(null);
    setProductMatches([]);
  };

  const addLine = () => setLines((previous) => [...previous, createLine()]);

  const removeLine = (index: number) => {
    setLines((previous) =>
      previous.length === 1
        ? previous.map(() => createLine())
        : previous.filter((_, lineIndex) => lineIndex !== index),
    );
  };

  const buildPayloadItems = () => {
    if (!customerId) {
      setStatusTone("error");
      setStatus("Selecciona un cliente o usa consumidor final.");
      return null;
    }

    const payloadItems = lines.map((line) => ({
      productId: line.productId || undefined,
      description: line.productId ? undefined : lineDescription(line),
      qty: Number(line.qty),
      unitPrice: netUnitPriceFromLine(line),
      taxRate: taxRateFromVatMode(line.taxRate),
    }));

    const invalidItem = payloadItems.some(
      (item) =>
        (!item.productId && !item.description) ||
        !Number.isFinite(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice <= 0,
    );

    if (invalidItem) {
      setStatusTone("error");
      setStatus("Completa producto o concepto, cantidad y monto.");
      return null;
    }

    return payloadItems;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const payloadItems = buildPayloadItems();
    if (!payloadItems) return;

    setIsSubmitting(true);
    try {
      const saleRes = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          saleDate,
          billingStatus: "TO_BILL",
          extraType: extraType === "NONE" ? undefined : extraType,
          extraValue:
            extraType === "NONE" || !extraValue ? undefined : Number(extraValue),
          adjustStock: true,
          items: payloadItems,
        }),
      });

      if (!saleRes.ok) {
        setStatusTone("error");
        setStatus(await readApiError(saleRes, "No se pudo crear la venta"));
        return;
      }

      const sale = (await saleRes.json()) as SaleRow;
      resetForm();
      setStatusTone("success");
      setStatus(`Venta ${sale.saleNumber ?? sale.id} creada.`);
      setCreatedSale(sale);
      setFlowStep("receipt");
      await onSaleCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetInvoiceDraft = () => {
    setSelectedInvoiceType("B");
    setInvoiceForm({ requiresIncomeTaxDeduction: false });
    setEditableInvoiceItems([]);
    setInvoiceStatus(null);
    setInvoiceWarnings([]);
    setInvoiceResolution(null);
  };

  const prepareInvoiceDraft = (sale: SaleRow) => {
    const customerFiscalProfile = normalizeCustomerFiscalTaxProfile(
      sale.customerFiscalTaxProfile ?? null,
    );
    setSelectedInvoiceType(
      resolveInvoiceTypeFromFiscalTaxProfile(customerFiscalProfile),
    );
    setInvoiceForm({ requiresIncomeTaxDeduction: false });
    setInvoiceStatus(null);
    setInvoiceWarnings([]);
    setInvoiceResolution(null);
    setEditableInvoiceItems(
      (sale.items ?? [])
        .filter(
          (
            item,
          ): item is NonNullable<SaleRow["items"]>[number] & { id: string } =>
            Boolean(item.id),
        )
        .map((item) => ({
          id: item.id,
          productName: item.productName,
          qty: item.qty,
          unitPrice: Number(item.unitPrice ?? 0).toFixed(2),
          taxRate: Number(item.taxRate ?? 0).toFixed(2),
        })),
    );
  };

  const closeCreatedSaleModal = () => {
    if (isFacturing || isUpdatingBillingStatus || isSavingInvoiceSale) return;
    setCreatedSale(null);
    setFlowStep("receipt");
    resetInvoiceDraft();
  };

  const openInvoiceForm = () => {
    if (!createdSale) return;
    prepareInvoiceDraft(createdSale);
    setFlowStep("invoiceForm");
  };

  const goBackCreatedSaleStep = () => {
    if (flowStep === "invoiceForm") {
      setFlowStep("invoice");
      return;
    }
    if (flowStep === "invoice") {
      setFlowStep("receipt");
    }
  };

  const handleInvoiceIssueError = (data: InvoiceApiErrorPayload | null) => {
    setInvoiceStatus(cleanInvoiceErrorMessage(data?.error));
    setInvoiceResolution(
      isInvoiceResolution(data?.resolution) ? data.resolution : null,
    );
  };

  const saveInvoiceSaleEdits = async () => {
    if (!createdSale || !hasEditableInvoiceChanges) return createdSale;
    setIsSavingInvoiceSale(true);
    try {
      const res = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: createdSale.id,
          note: "Importes ajustados antes de emitir factura",
          items: editableInvoiceItems.map((item) => ({
            id: item.id,
            unitPrice: Number(item.unitPrice ?? 0),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceStatus(
          data?.error ?? "No se pudieron guardar los cambios de la venta.",
        );
        return null;
      }
      const updatedSale = data as SaleRow;
      setCreatedSale(updatedSale);
      setInvoiceStatus("Importes actualizados. Emiti la factura cuando este listo.");
      await onSaleCreated();
      return updatedSale;
    } catch {
      setInvoiceStatus("No se pudieron guardar los cambios de la venta.");
      return null;
    } finally {
      setIsSavingInvoiceSale(false);
    }
  };

  const applyIssuedInvoice = async (
    saleSnapshot: SaleRow,
    invoice: IssuedInvoicePayload,
    warnings: string[],
  ) => {
    setInvoiceWarnings(warnings);
    setInvoiceStatus("Factura emitida correctamente.");
    setStatusTone("success");
    setStatus(`Venta ${saleSnapshot.saleNumber ?? saleSnapshot.id} facturada.`);
    setCreatedSale(null);
    setFlowStep("receipt");
    resetInvoiceDraft();
    await onSaleCreated();
    window.open(
      `/api/fiscal-invoices/${invoice.id}/pdf`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const waitForQueuedInvoice = async (jobId: string, saleSnapshot: SaleRow) => {
    for (let attempt = 0; attempt < QUEUE_POLL_ATTEMPTS; attempt += 1) {
      const pollResponse = await fetch(`/api/fiscal-invoices/jobs/${jobId}`, {
        cache: "no-store",
      });
      const pollData = await pollResponse.json();
      if (!pollResponse.ok) {
        handleInvoiceIssueError(
          pollData && typeof pollData === "object"
            ? (pollData as InvoiceApiErrorPayload)
            : null,
        );
        return false;
      }

      if (
        pollData?.status === "COMPLETED" &&
        pollData?.invoice &&
        typeof pollData.invoice.id === "string"
      ) {
        const warnings = Array.isArray(pollData?.warnings)
          ? pollData.warnings.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : [];
        await applyIssuedInvoice(
          saleSnapshot,
          {
            id: pollData.invoice.id,
            type:
              typeof pollData.invoice.type === "string"
                ? pollData.invoice.type
                : null,
            pointOfSale:
              typeof pollData.invoice.pointOfSale === "string"
                ? pollData.invoice.pointOfSale
                : null,
            number:
              typeof pollData.invoice.number === "string"
                ? pollData.invoice.number
                : null,
            cae:
              typeof pollData.invoice.cae === "string"
                ? pollData.invoice.cae
                : null,
            issuedAt:
              typeof pollData.invoice.issuedAt === "string"
                ? pollData.invoice.issuedAt
                : null,
            createdAt:
              typeof pollData.invoice.createdAt === "string"
                ? pollData.invoice.createdAt
                : null,
          },
          warnings,
        );
        return true;
      }

      if (pollData?.status === "ERROR") {
        handleInvoiceIssueError(
          pollData && typeof pollData === "object"
            ? (pollData as InvoiceApiErrorPayload)
            : null,
        );
        return false;
      }

      setInvoiceStatus(
        pollData?.status === "RUNNING"
          ? "Factura en procesamiento..."
          : "Factura en cola, esperando turno...",
      );
      setInvoiceResolution(null);
      await sleep(QUEUE_POLL_INTERVAL_MS);
    }

    setInvoiceStatus(
      "La factura sigue en cola. Revisa en unos segundos desde el listado.",
    );
    return false;
  };

  const handleInvoiceCreatedSale = async (options?: {
    issueDateOverride?: string;
  }) => {
    if (!createdSale) return;
    const saleSnapshot = hasEditableInvoiceChanges
      ? await saveInvoiceSaleEdits()
      : createdSale;
    if (!saleSnapshot) {
      setInvoiceResolution(null);
      return;
    }

    const draft = buildInvoiceDraft();
    if (!draft.ok) {
      setInvoiceStatus(draft.error);
      setInvoiceResolution(null);
      return;
    }

    setInvoiceStatus(null);
    setInvoiceResolution(null);
    setInvoiceWarnings([]);
    setIsFacturing(true);
    try {
      const res = await fetch("/api/fiscal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: saleSnapshot.id,
          type: resolvedInvoiceType,
          issueDate: options?.issueDateOverride,
          itemsTaxRates: draft.itemsTaxRates,
          requiresIncomeTaxDeduction: invoiceForm.requiresIncomeTaxDeduction,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleInvoiceIssueError(
          data && typeof data === "object"
            ? (data as InvoiceApiErrorPayload)
            : null,
        );
        return;
      }

      if (typeof data?.id === "string") {
        const warnings = Array.isArray(data?.warnings)
          ? data.warnings.filter(
              (item: unknown): item is string => typeof item === "string",
            )
          : [];
        await applyIssuedInvoice(
          saleSnapshot,
          {
            id: data.id,
            type: typeof data?.type === "string" ? data.type : null,
            pointOfSale:
              typeof data?.pointOfSale === "string" ? data.pointOfSale : null,
            number: typeof data?.number === "string" ? data.number : null,
            cae: typeof data?.cae === "string" ? data.cae : null,
            issuedAt: typeof data?.issuedAt === "string" ? data.issuedAt : null,
            createdAt: typeof data?.createdAt === "string" ? data.createdAt : null,
          },
          warnings,
        );
        return;
      }

      if (typeof data?.jobId === "string") {
        await waitForQueuedInvoice(data.jobId, saleSnapshot);
        return;
      }

      setInvoiceStatus("No se pudo emitir factura");
      setInvoiceResolution(null);
    } catch {
      setInvoiceStatus("No se pudo emitir factura");
      setInvoiceResolution(null);
    } finally {
      setIsFacturing(false);
    }
  };

  const applyInvoiceResolution = async () => {
    if (!invoiceResolution) return;
    if (invoiceResolution.type === "RECALCULATE_FISCAL_TOTALS") {
      await handleInvoiceCreatedSale();
      return;
    }
    await handleInvoiceCreatedSale({
      issueDateOverride: invoiceResolution.issueDate,
    });
  };

  const handleBillingStatusChoice = async (
    billingStatus: "TO_BILL" | "NOT_BILLED",
  ) => {
    if (!createdSale) return;
    setIsUpdatingBillingStatus(true);
    try {
      const res = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: createdSale.id,
          billingStatus,
          note:
            billingStatus === "NOT_BILLED"
              ? "Marcada como registro interno desde venta completa"
              : "Marcada como pendiente de facturacion desde venta completa",
        }),
      });
      if (!res.ok) {
        setStatusTone("error");
        setStatus(
          await readApiError(res, "No se pudo actualizar la facturacion"),
        );
        return;
      }
      setStatusTone("success");
      setStatus(
        billingStatus === "NOT_BILLED"
          ? `Venta ${createdSale.saleNumber ?? createdSale.id} guardada como registro interno.`
          : `Venta ${createdSale.saleNumber ?? createdSale.id} pendiente de facturacion.`,
      );
      setCreatedSale(null);
      setFlowStep("receipt");
      resetInvoiceDraft();
      await onSaleCreated();
    } finally {
      setIsUpdatingBillingStatus(false);
    }
  };

  return (
    <>
    <div className="card space-y-6 p-4 sm:p-6 lg:p-7">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Nueva venta</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
          <div className="field-stack">
            <span className="input-label">Cliente</span>
            <div className="relative">
              <input
                className="input w-full"
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.target.value);
                  setCustomerId("");
                  setSelectedCustomer(null);
                  setIsCustomerOpen(true);
                }}
                onFocus={() => {
                  setIsCustomerOpen(true);
                  loadCustomers(customerSearch).catch(() => undefined);
                }}
                onBlur={() => {
                  window.setTimeout(() => setIsCustomerOpen(false), 120);
                }}
                placeholder="Buscar cliente"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={isCustomerOpen}
                aria-controls="sale-customer-options"
                required
              />
              {isCustomerOpen ? (
                <div
                  id="sale-customer-options"
                  role="listbox"
                  aria-label="Clientes"
                  className="absolute z-[80] mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200/70 bg-white/95 p-2 text-sm shadow-[0_18px_48px_-28px_rgba(24,24,27,0.6)] backdrop-blur-xl"
                >
                  {isCustomerLoading ? (
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      Buscando...
                    </p>
                  ) : customerMatches.length ? (
                    customerMatches.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-white/70"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCustomer(customer)}
                      >
                        <span className="min-w-0 truncate font-medium text-zinc-900">
                          {customer.displayName}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {customer.taxId || customer.phone || customer.type}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      Sin resultados.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-2 ml-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <button
                type="button"
                role="switch"
                aria-label="Consumidor final"
                aria-checked={selectedCustomer?.type === "CONSUMER_FINAL"}
                onClick={toggleConsumerFinal}
                disabled={isResolvingConsumerFinal || isSubmitting}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                  selectedCustomer?.type === "CONSUMER_FINAL"
                    ? "border-sky-300 bg-sky-100"
                    : "border-zinc-300 bg-zinc-100"
                } ${
                  isResolvingConsumerFinal || isSubmitting
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
                    selectedCustomer?.type === "CONSUMER_FINAL"
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
              <span>Consumidor final</span>
              {selectedCustomer?.taxId ? (
                <span className="text-[11px] font-medium text-sky-700">
                  CUIT/DNI {selectedCustomer.taxId}
                </span>
              ) : null}
            </div>
          </div>

          <div className="field-stack">
            <label className="field-stack">
              <span className="input-label">Fecha</span>
              <input
                type="date"
                className="input w-full cursor-pointer"
                value={saleDate}
                onChange={(event) => setSaleDate(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="subtle-divider" />

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="field-stack">
              <p className="section-title">Items</p>
            </div>
          </div>

          <div className="divide-y divide-zinc-200">
            {lines.map((line, index) => {
              const currentTotals = lineTotals(line);
              const isOpen = openProductIndex === index;

              return (
                <div key={line.localId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
                    <label className="field-stack min-w-[13rem] flex-1">
                      <span className="input-label">
                        {index === 0 ? "Producto/concepto" : `Item ${index + 1}`}
                      </span>
                      <div className={`relative ${isOpen ? "z-[90]" : ""}`}>
                        <input
                          className="input w-full"
                          value={line.productSearch}
                          onChange={(event) => {
                            updateLine(
                              index,
                              "productSearch",
                              event.target.value,
                            );
                            setOpenProductIndex(index);
                          }}
                          onFocus={() => setOpenProductIndex(index)}
                          onBlur={() => {
                            window.setTimeout(
                              () => setOpenProductIndex(null),
                              120,
                            );
                          }}
                          placeholder="Buscar producto o escribir concepto"
                          autoComplete="off"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-haspopup="listbox"
                          aria-expanded={isOpen}
                          aria-controls={`sale-product-options-${index}`}
                          required
                        />
                        {isOpen ? (
                          <div
                            id={`sale-product-options-${index}`}
                            role="listbox"
                            aria-label="Productos"
                            className="absolute z-[90] mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200/70 bg-white/95 p-2 text-sm shadow-[0_18px_48px_-28px_rgba(24,24,27,0.6)] backdrop-blur-xl"
                          >
                            {isProductLoading ? (
                              <p className="px-3 py-2 text-xs text-zinc-500">
                                Buscando...
                              </p>
                            ) : productMatches.length ? (
                              productMatches.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-white/70"
                                  onMouseDown={(event) =>
                                    event.preventDefault()
                                  }
                                  onClick={() => selectProduct(index, product)}
                                >
                                  <span className="min-w-0 truncate font-medium text-zinc-900">
                                    {formatProductLabel(product)}
                                  </span>
                                  <span className="shrink-0 text-xs text-zinc-500">
                                    {product.unit ?? "Producto"}
                                  </span>
                                </button>
                              ))
                            ) : line.productSearch.trim() ? (
                              <p className="px-3 py-2 text-xs text-zinc-500">
                                Se guardara como concepto manual.
                              </p>
                            ) : (
                              <p className="px-3 py-2 text-xs text-zinc-500">
                                Escribi para buscar o cargar manual.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {line.productId ? (
                        <span className="text-[11px] font-medium text-emerald-700">
                          Producto del catalogo
                        </span>
                      ) : line.productSearch.trim() ? (
                        <span className="text-[11px] font-medium text-zinc-500">
                          Concepto manual
                        </span>
                      ) : null}
                    </label>

                    <label className="field-stack w-[4.75rem] shrink-0">
                      <span className="input-label">Cant.</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                        value={formatQuantityInput(line.qty)}
                        onChange={(event) =>
                          updateLine(
                            index,
                            "qty",
                            normalizeDecimalInput(event.target.value, 3),
                          )
                        }
                        placeholder="1"
                        required
                      />
                    </label>

                    <label className="field-stack w-[8.25rem] shrink-0">
                      <span className="input-label">
                        {amountModeInputLabel(line.amountMode)}
                      </span>
                      <MoneyInput
                        className="input no-spinner h-10 w-full min-w-0 px-2 text-right text-xs tabular-nums"
                        value={line.amount}
                        onValueChange={(value) =>
                          updateLine(index, "amount", value)
                        }
                        prefix="$"
                        placeholder="0,00"
                        maxDecimals={2}
                        caretToEndOnFocus
                        required
                      />
                    </label>

                    <div className="field-stack w-[8.25rem] shrink-0">
                      <span className="input-label">Carga</span>
                      <SaleSelect
                        value={line.amountMode}
                        options={SALE_AMOUNT_MODE_OPTIONS}
                        onValueChange={(value) =>
                          updateLine(index, "amountMode", value)
                        }
                        ariaLabel="Modo de carga"
                        buttonClassName="px-2"
                        optionClassName="px-2 py-1.5 text-xs"
                      />
                    </div>

                    <div className="field-stack w-[6.75rem] shrink-0">
                      <span className="input-label">IVA</span>
                      <SaleSelect
                        value={line.taxRate}
                        options={SALE_TAX_RATE_OPTIONS}
                        onValueChange={(value) =>
                          updateLine(index, "taxRate", value)
                        }
                        ariaLabel="IVA"
                        buttonClassName="px-2"
                        menuClassName="min-w-32"
                      />
                    </div>

                    <div className="flex w-9 shrink-0 items-end justify-end pt-6">
                      <button
                        type="button"
                        className="btn h-9 w-9 justify-center border-rose-200 p-0 text-rose-700 hover:bg-rose-50"
                        onClick={() => removeLine(index)}
                        disabled={isSubmitting}
                        aria-label="Eliminar item"
                        title="Eliminar item"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>

                  <SaleLineTotalsStrip
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

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3 text-sm">
              <p className="section-title">Ajustes de venta</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`toggle-pill ${
                    adjustmentMode === "NONE" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => setExtraType("NONE")}
                  aria-pressed={adjustmentMode === "NONE"}
                >
                  Sin ajuste
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    adjustmentMode === "CARD_INTEREST" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => setExtraType("CARD_INTEREST_PERCENT")}
                  aria-pressed={adjustmentMode === "CARD_INTEREST"}
                >
                  Interes tarjeta
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    adjustmentMode === "SURCHARGE" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => setExtraType("PERCENT")}
                  aria-pressed={adjustmentMode === "SURCHARGE"}
                >
                  Recargo
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    adjustmentMode === "DISCOUNT_SUBTOTAL"
                      ? "toggle-pill-active"
                      : ""
                  }`}
                  onClick={() => setExtraType("DISCOUNT_PERCENT")}
                  aria-pressed={adjustmentMode === "DISCOUNT_SUBTOTAL"}
                >
                  Desc. subtotal
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    adjustmentMode === "DISCOUNT_TOTAL"
                      ? "toggle-pill-active"
                      : ""
                  }`}
                  onClick={() => setExtraType("DISCOUNT_TOTAL_PERCENT")}
                  aria-pressed={adjustmentMode === "DISCOUNT_TOTAL"}
                >
                  Desc. total
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`toggle-pill ${
                    isPercentExtra && adjustmentMode !== "NONE"
                      ? "toggle-pill-active"
                      : ""
                  }`}
                  onClick={() => setExtraType(nextTypeForUnit("PERCENT"))}
                  aria-pressed={isPercentExtra && adjustmentMode !== "NONE"}
                  disabled={adjustmentMode === "NONE"}
                >
                  Porcentaje
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    !isPercentExtra && adjustmentMode !== "NONE"
                      ? "toggle-pill-active"
                      : ""
                  }`}
                  onClick={() => setExtraType(nextTypeForUnit("FIXED"))}
                  aria-pressed={!isPercentExtra && adjustmentMode !== "NONE"}
                  disabled={adjustmentMode === "NONE"}
                >
                  Importe fijo
                </button>
              </div>
              <div className="field-stack max-w-sm">
                <span className="input-label">
                  {isPercentExtra ? "Valor (%)" : "Importe ($)"}
                </span>
                <div className="relative">
                  {isPercentExtra ? null : (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                      $
                    </span>
                  )}
                  {isPercentExtra ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                      %
                    </span>
                  ) : null}
                  {isPercentExtra ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input no-spinner w-full pr-10 text-right tabular-nums"
                      value={formatPercentInput(extraValue)}
                      onChange={(event) =>
                        setExtraValue(normalizeDecimalInput(event.target.value, 2))
                      }
                      placeholder="0"
                      disabled={adjustmentMode === "NONE"}
                    />
                  ) : (
                    <MoneyInput
                      className="input no-spinner w-full pl-10 text-right tabular-nums"
                      value={extraValue}
                      onValueChange={setExtraValue}
                      placeholder="0,00"
                      disabled={adjustmentMode === "NONE"}
                      maxDecimals={2}
                    />
                  )}
                </div>
              </div>
              <p className="section-subtitle">
                {adjustmentMode === "NONE"
                  ? "Sin ajustes aplicados."
                  : adjustmentMode === "CARD_INTEREST" && isPercentExtra
                    ? "El interes de tarjeta se calcula sobre neto + IVA."
                    : adjustmentMode === "DISCOUNT_TOTAL" && isPercentExtra
                      ? "El descuento porcentual se calcula sobre neto + IVA."
                      : isPercentExtra
                        ? "El porcentaje se aplica sobre el neto."
                        : "El importe fijo se suma o descuenta del total."}
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-4 text-sm text-emerald-950/80">
              <p className="section-title !text-emerald-950/70">Totales</p>
              <div className="mt-3 space-y-2 text-sm text-emerald-950/75">
                <div className="flex items-center justify-between">
                  <span>Neto</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>IVA</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(taxes)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{extraSummaryLabel}</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(extraAmount)}
                  </span>
                </div>
                <div className="mt-3 border-t border-emerald-200 pt-3 text-base font-semibold text-emerald-950">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span>{formatCurrencyARS(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="subtle-divider" />

        <div className="grid gap-3">
          <button
            type="submit"
            className="btn btn-emerald w-full"
            disabled={isSubmitting}
          >
            <CheckIcon className="size-4" />
            {isSubmitting ? "Guardando..." : "Guardar venta"}
          </button>
        </div>
        {status ? (
          <p
            className={`text-xs font-medium ${
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
      </form>
    </div>

    {createdSale ? (
      <div className="fixed inset-0 z-[130] flex items-end justify-center bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center">
        <div
          className={cn(
            "card max-h-[92vh] w-full space-y-4 overflow-y-auto",
            flowStep === "invoiceForm"
              ? "max-w-[54rem] p-4"
              : flowStep === "receipt"
                ? "max-w-[64rem] p-5 sm:p-6"
                : "max-w-2xl p-4",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-zinc-900">
                Venta {createdSale.saleNumber ?? "-"}
              </h4>
              <p className="text-xs text-zinc-500">
                {flowStep === "receipt"
                  ? "Registrar cobro"
                  : flowStep === "invoiceForm"
                    ? "Emitir factura"
                    : "Facturacion"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {flowStep !== "receipt" ? (
                <button
                  type="button"
                  className="btn h-9 px-3.5 text-sm"
                  onClick={goBackCreatedSaleStep}
                  disabled={
                    isFacturing || isUpdatingBillingStatus || isSavingInvoiceSale
                  }
                >
                  <ChevronLeftIcon className="size-4" />
                  Volver
                </button>
              ) : null}
              <button
                type="button"
                className="btn h-9 w-9 justify-center p-0"
                onClick={closeCreatedSaleModal}
                aria-label="Cerrar"
                disabled={isFacturing || isSavingInvoiceSale}
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
          </div>

          {flowStep === "receipt" ? (
            <div className="space-y-3">
              <ReceiptForm
                saleId={createdSale.id}
                saleTotal={createdSale.total}
                paymentMethods={paymentMethods}
                accounts={accounts}
                currencies={currencies}
                latestUsdRate={latestUsdRate}
                submitLabel="Registrar cobro"
                secondaryAction={{
                  label: "Omitir cobro",
                  icon: <ChevronRightIcon className="size-4" />,
                  onClick: () => setFlowStep("invoice"),
                }}
                onCreated={() => {
                  setFlowStep("invoice");
                  void onSaleCreated();
                }}
              />
            </div>
          ) : flowStep === "invoice" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-4 text-sm text-zinc-600">
                Elegi si emitis la factura ahora o como queda registrada la
                venta.
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className="btn btn-sky"
                  onClick={openInvoiceForm}
                  disabled={isFacturing || isUpdatingBillingStatus}
                >
                  <DocumentTextIcon className="size-4" />
                  Facturar ahora
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleBillingStatusChoice("TO_BILL")}
                  disabled={isFacturing || isUpdatingBillingStatus}
                >
                  <ClockIcon className="size-4" />
                  {isUpdatingBillingStatus ? "Guardando..." : "Pendiente"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleBillingStatusChoice("NOT_BILLED")}
                  disabled={isFacturing || isUpdatingBillingStatus}
                >
                  <CheckIcon className="size-4" />
                  Registro interno
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {invoiceStatus || invoiceWarnings.length ? (
                <div className="space-y-2">
                  {invoiceStatus ? (
                    <p
                      className={cn(
                        "text-sm font-medium",
                        invoiceStatus === "Factura emitida correctamente."
                          ? "text-emerald-700"
                          : "text-zinc-800",
                      )}
                    >
                      {invoiceStatus}
                    </p>
                  ) : null}
                  {invoiceWarnings.length ? (
                    <ul className="space-y-1 text-xs text-amber-700">
                      {invoiceWarnings.map((warning) => (
                        <li key={warning}>- {warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {invoiceResolution ? (
                <div className="space-y-3 rounded-[20px] border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Solucion sugerida
                  </p>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {invoiceResolution.title}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-zinc-600 sm:text-sm">
                      {invoiceResolution.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-emerald h-9 px-3.5 text-sm"
                    onClick={() => {
                      void applyInvoiceResolution();
                    }}
                    disabled={isFacturing || isSavingInvoiceSale}
                  >
                    <CheckIcon className="size-4" />
                    {isFacturing
                      ? "Emitiendo..."
                      : invoiceResolution.primaryActionLabel}
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <section>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="section-title">Comprobante</p>
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                        Tipo de factura
                      </p>
                    </div>
                    {resolvedInvoiceType !== recommendedInvoiceType ? (
                      <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-amber-800">
                        Sugerida: Factura {recommendedInvoiceType}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 inline-flex rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_2px_12px_-10px_rgba(24,24,27,0.22)]">
                    {(["A", "B"] as const).map((invoiceType) => (
                      <button
                        key={invoiceType}
                        type="button"
                        className={cn(
                          "min-w-[112px] rounded-[14px] px-3.5 py-1.5 text-sm font-semibold transition",
                          resolvedInvoiceType === invoiceType
                            ? "bg-zinc-900 text-white shadow-sm"
                            : "text-zinc-600 hover:bg-zinc-50",
                        )}
                        onClick={() => setSelectedInvoiceType(invoiceType)}
                        disabled={isFacturing || isSavingInvoiceSale}
                      >
                        Factura {invoiceType}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="self-start">
                  <p className="section-title">Condicion fiscal</p>
                  <p className="mt-2.5 text-base font-semibold text-zinc-900">
                    {customerFiscalTaxProfileLabel}
                  </p>
                </section>
              </div>

              <section className="space-y-4">
                <div className="min-w-0">
                  <p className="section-title">Receptor</p>
                  <p className="mt-1.5 text-base font-semibold text-zinc-950">
                    {recipientDocumentLabel}
                  </p>
                </div>

                {invoiceRecipientRequirementMessage ? (
                  <p className="text-sm leading-5 text-amber-800">
                    {invoiceRecipientRequirementMessage}
                  </p>
                ) : null}

                {shouldShowDeductionToggle ? (
                  <label className="flex items-start gap-3 border-t border-zinc-200/70 pt-4 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                      checked={invoiceForm.requiresIncomeTaxDeduction}
                      onChange={(event) =>
                        setInvoiceForm((previous) => ({
                          ...previous,
                          requiresIncomeTaxDeduction: event.target.checked,
                        }))
                      }
                      disabled={isFacturing || isSavingInvoiceSale}
                    />
                    <span>El receptor solicita deduccion en Ganancias</span>
                  </label>
                ) : null}
              </section>

              {hasRegularSurchargeAdjustment ? (
                <section>
                  <p className="section-title text-amber-700">
                    Revisar recargo e IVA
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-700 sm:text-sm">
                    Esta venta tiene un recargo de{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(fiscalAdjustmentTotal.toFixed(2))}
                    </span>
                    . Para emitir, se integra al neto y al IVA fiscal para que
                    la alicuota cierre contra la base imponible.
                  </p>
                </section>
              ) : null}

              {editableInvoiceItems.length ? (
                <section>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="section-title">Importes</p>
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900 sm:text-base">
                        Revisar antes de emitir
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-medium",
                        hasEditableInvoiceChanges
                          ? "border border-amber-200 bg-amber-50 text-amber-800"
                          : "border border-emerald-200 bg-emerald-50 text-emerald-800",
                      )}
                    >
                      {hasEditableInvoiceChanges
                        ? "Cambios pendientes"
                        : "Sin cambios"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    {editableInvoiceItems.map((item, index) => {
                      const previewItem = invoicePreviewItems[index] ?? {
                        lineTotal: 0,
                      };
                      return (
                        <div
                          key={item.id}
                          className="grid gap-3.5 rounded-[20px] border border-zinc-200/80 bg-zinc-50/60 p-3.5 xl:grid-cols-[minmax(0,1.8fr)_112px_176px_160px] xl:items-end"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">
                              {item.productName}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              IVA {Number(item.taxRate).toLocaleString("es-AR")}%
                            </p>
                          </div>
                          <div>
                            <p className="input-label">Cantidad</p>
                            <div className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-600">
                              {Number(item.qty).toLocaleString("es-AR")}
                            </div>
                          </div>
                          <label className="field-stack">
                            <span className="input-label">Precio unitario</span>
                            <MoneyInput
                              className="input w-full"
                              value={item.unitPrice}
                              onValueChange={(value) =>
                                setEditableInvoiceItems((previous) =>
                                  previous.map((candidate) =>
                                    candidate.id === item.id
                                      ? {
                                          ...candidate,
                                          unitPrice: value || "0",
                                        }
                                      : candidate,
                                  ),
                                )
                              }
                              disabled={isFacturing || isSavingInvoiceSale}
                              placeholder="0,00"
                            />
                          </label>
                          <div>
                            <p className="input-label">Total</p>
                            <div className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 sm:text-base">
                              {formatCurrencyARS(
                                previewItem.lineTotal.toFixed(2),
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {fiscalPreview ? (
                <section className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/50 p-4">
                  <p className="section-title">Resumen fiscal</p>
                  <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                    <FiscalAmountItem label="Neto" value={fiscalPreview.net} />
                    <FiscalAmountItem label="IVA" value={fiscalPreview.iva} />
                    <FiscalAmountItem
                      label={fiscalAdjustmentLabel}
                      value={fiscalAdjustmentTotal}
                    />
                    <FiscalAmountItem label="Total" value={fiscalPreview.total} />
                  </div>
                </section>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-zinc-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                {hasEditableInvoiceChanges ? (
                  <p className="text-xs text-amber-700">
                    Se guardaran los cambios antes de emitir.
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="btn h-10 px-4 text-sm"
                    onClick={goBackCreatedSaleStep}
                    disabled={isFacturing || isSavingInvoiceSale}
                  >
                    <ChevronLeftIcon className="size-4" />
                    Volver
                  </button>
                  <button
                    type="button"
                    className="btn btn-emerald h-10 min-w-[180px] px-4 text-sm"
                    onClick={() => {
                      void handleInvoiceCreatedSale();
                    }}
                    disabled={isFacturing || isSavingInvoiceSale}
                  >
                    <DocumentTextIcon className="size-4" />
                    {isSavingInvoiceSale
                      ? "Guardando cambios..."
                      : isFacturing
                        ? "Emitiendo..."
                        : "Emitir factura"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null}
    </>
  );
}
