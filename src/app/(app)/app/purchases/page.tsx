"use client";

import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ChevronDownIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { canCancelSupplierPayments } from "@/lib/auth/rbac";
import { STOCK_ENABLED } from "@/lib/features";
import { formatCurrencyARS } from "@/lib/format";
import { normalizeDecimalInput } from "@/lib/input-format";
import {
  calculateAutoTotalsFromProducts,
  calculateFiscalLineAmount,
  compareArcaVoucherAgainstForm,
  normalizeJurisdiction,
  suggestJurisdictions,
  summarizeArcaMismatches,
  type PurchaseArcaMismatchField,
  type PurchaseArcaVoucherSnapshot,
  type PurchaseTotalsSource,
} from "@/lib/purchases/new-purchase";
import { SupplierPaymentsPanel } from "./components/SupplierPaymentsPanel";
import type { ProductOption, PurchaseRow, SupplierOption } from "./types";
import {
  formatProductLabel,
  formatSupplierLabel,
  formatUnit,
  normalizeQuery,
} from "./utils";

type PaymentMethodOption = {
  id: string;
  name: string;
  type: string;
  requiresAccount: boolean;
  isActive?: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
  isActive?: boolean;
};

type CurrencyOption = {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  isDefault: boolean;
};

type PurchaseProductForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitCost: string;
  taxRate: string;
};

type PurchaseFiscalLineType =
  | "IIBB_PERCEPTION"
  | "VAT_PERCEPTION"
  | "INCOME_TAX_PERCEPTION"
  | "MUNICIPAL_PERCEPTION"
  | "INTERNAL_TAX"
  | "OTHER";

type PurchaseFiscalLineForm = {
  type: PurchaseFiscalLineType;
  jurisdiction: string;
  baseAmount: string;
  rate: string;
  amount: string;
  manualAmountOverride: boolean;
  note: string;
};

type PurchasePaymentMode =
  | "CURRENT_ACCOUNT"
  | "IMMEDIATE_CASH_OUT"
  | "OFF_BOOK";

type SimpleFiscalCondition = "GRAVADO" | "NO_GRAVADO" | "EXENTO";

type PurchaseSectionId =
  | "supplier"
  | "invoice"
  | "products"
  | "totals"
  | "taxes"
  | "payment";

type FiscalDetailPayload = {
  netTaxed: number;
  netNonTaxed: number;
  exemptAmount: number;
  vatTotal: number;
  lines: Array<{
    type: PurchaseFiscalLineType;
    jurisdiction?: string;
    baseAmount?: number;
    rate?: number;
    amount: number;
    note?: string;
  }>;
};

type PurchasePayload = {
  supplierId: string;
  hasInvoice: boolean;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount: number;
  purchaseVatAmount?: number;
  fiscalDetail?: FiscalDetailPayload;
  impactCurrentAccount: boolean;
  items?: Array<{
    productId: string;
    qty: number;
    unitCost: number;
    taxRate: number;
  }>;
  adjustStock: boolean;
  registerCashOut: boolean;
  cashOutPaymentMethodId?: string;
  cashOutAccountId?: string;
  validateWithArca: boolean;
  arcaValidation?: Record<string, string | number>;
};

type PreparedPurchase = {
  payload: PurchasePayload;
  supplierLabel: string;
  dateLabel: string;
  invoiceLabel: string;
  paymentLabel: string;
  total: number;
  vatAmount: number | null;
  productCount: number;
  productTotal: number;
  fiscalOtherTotal: number;
  fiscalDifference: number;
};

const emptyPurchaseProduct = (): PurchaseProductForm => ({
  productId: "",
  productSearch: "",
  qty: "1",
  unitCost: "",
  taxRate: "21",
});

const emptyFiscalLine = (): PurchaseFiscalLineForm => ({
  type: "IIBB_PERCEPTION",
  jurisdiction: "",
  baseAmount: "",
  rate: "",
  amount: "",
  manualAmountOverride: false,
  note: "",
});

const PURCHASE_FISCAL_LINE_OPTIONS: Array<{
  value: PurchaseFiscalLineType;
  label: string;
}> = [
  { value: "IIBB_PERCEPTION", label: "Percepcion IIBB" },
  { value: "VAT_PERCEPTION", label: "Percepcion IVA" },
  { value: "INCOME_TAX_PERCEPTION", label: "Percepcion Ganancias" },
  { value: "MUNICIPAL_PERCEPTION", label: "Percepcion municipal" },
  { value: "INTERNAL_TAX", label: "Impuesto interno" },
  { value: "OTHER", label: "Otro" },
];

const parsePositiveNumber = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const normalizeTaxId = (value: string) => value.replace(/\D/g, "");

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateInputLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const arcaStatusLabel = (value: string | null | undefined) => {
  const labels: Record<string, string> = {
    AUTHORIZED: "Autorizado",
    OBSERVED: "Observado",
    REJECTED: "Rechazado",
    ERROR: "Error",
    PENDING: "Pendiente",
  };
  return value ? labels[value] ?? value : "Pendiente";
};

const PURCHASE_PAYMENT_MODE_OPTIONS: Array<{
  value: PurchasePaymentMode;
  label: string;
  description: string;
}> = [
  {
    value: "CURRENT_ACCOUNT",
    label: "Cuenta corriente",
    description: "La compra queda pendiente para pagar luego.",
  },
  {
    value: "IMMEDIATE_CASH_OUT",
    label: "Pago inmediato",
    description: "Registra egreso ahora y no deja deuda.",
  },
  {
    value: "OFF_BOOK",
    label: "Sin impacto",
    description: "No impacta cuenta corriente ni egreso.",
  },
];

const PURCHASE_ITEM_TAX_RATE_OPTIONS = [
  { value: "21", label: "IVA 21%" },
  { value: "10.5", label: "IVA 10,5%" },
  { value: "27", label: "IVA 27%" },
  { value: "0", label: "Sin IVA" },
];

const SIMPLE_FISCAL_CONDITION_OPTIONS: Array<{
  value: SimpleFiscalCondition;
  label: string;
}> = [
  { value: "GRAVADO", label: "Gravado" },
  { value: "NO_GRAVADO", label: "No gravado" },
  { value: "EXENTO", label: "Exento" },
];

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toMoneyValue = (value: number) => roundMoney(value).toFixed(2);

function MiniToggle({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-zinc-700">
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          checked
            ? "border-sky-300 bg-sky-100"
            : "border-zinc-300 bg-zinc-100"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span>{label}</span>
    </div>
  );
}

function PurchaseSection({
  title,
  summary,
  open,
  error = false,
  className = "",
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  error?: boolean;
  className?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-visible rounded-2xl border bg-white transition-[border-color,border-style,box-shadow] ${className} ${
        error
          ? "border-solid border-rose-300"
          : open
            ? "border-solid border-sky-300"
            : "border-dashed border-sky-300"
      }`}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{summary}</p>
        </div>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="purchase-section-content"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="-mx-1 -mb-1 overflow-visible px-1 pb-1"
          >
            <div className="border-t border-zinc-200/70 px-4 pb-4 pt-4">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function InlineDataNotice({
  tone = "amber",
  title,
  message,
  children,
}: {
  tone?: "amber" | "rose" | "zinc";
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 text-rose-800"
      : tone === "zinc"
        ? "border-zinc-200 text-zinc-700"
        : "border-amber-200 text-amber-800";

  return (
    <div className={`rounded-xl border bg-white px-3 py-2 ${toneClass}`}>
      <div className="flex items-start gap-2">
        <ExclamationTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
            {message}
          </p>
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const [supplierMatches, setSupplierMatches] = useState<SupplierOption[]>([]);
  const [productMatchesByQuery, setProductMatchesByQuery] = useState<
    Record<string, ProductOption[]>
  >({});
  const [selectedProductsById, setSelectedProductsById] = useState<
    Record<string, ProductOption>
  >({});
  const [isSupplierMatchesLoading, setIsSupplierMatchesLoading] = useState(false);
  const [isProductMatchesLoading, setIsProductMatchesLoading] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>(
    [],
  );
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [latestUsdRate, setLatestUsdRate] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierOption | null>(null);
  const [selectedSupplierTaxId, setSelectedSupplierTaxId] = useState("");
  const [supplierDataStatus, setSupplierDataStatus] = useState<string | null>(
    null,
  );
  const [isUpdatingSelectedSupplier, setIsUpdatingSelectedSupplier] =
    useState(false);
  const [isVerifyingSelectedSupplier, setIsVerifyingSelectedSupplier] =
    useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [supplierActiveIndex, setSupplierActiveIndex] = useState(0);

  const [hasInvoice, setHasInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [simpleNetAmount, setSimpleNetAmount] = useState("");
  const [simpleFiscalCondition, setSimpleFiscalCondition] =
    useState<SimpleFiscalCondition>("GRAVADO");
  const [purchaseVatAmount, setPurchaseVatAmount] = useState("");
  const [totalsSource, setTotalsSource] =
    useState<PurchaseTotalsSource>("AUTO_FROM_PRODUCTS");
  const [showFiscalDetail, setShowFiscalDetail] = useState(false);
  const [netTaxedAmount, setNetTaxedAmount] = useState("");
  const [netNonTaxedAmount, setNetNonTaxedAmount] = useState("");
  const [exemptAmount, setExemptAmount] = useState("");
  const [fiscalLines, setFiscalLines] = useState<PurchaseFiscalLineForm[]>([]);
  const [paymentMode, setPaymentMode] = useState<PurchasePaymentMode>("OFF_BOOK");

  const [includeProductDetails, setIncludeProductDetails] = useState(false);
  const [adjustStock, setAdjustStock] = useState(false);
  const [purchaseProducts, setPurchaseProducts] = useState<PurchaseProductForm[]>([
    emptyPurchaseProduct(),
  ]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);
  const [openJurisdictionIndex, setOpenJurisdictionIndex] = useState<number | null>(
    null,
  );
  const [jurisdictionActiveIndex, setJurisdictionActiveIndex] = useState(0);
  const [creatingProductIndex, setCreatingProductIndex] = useState<
    number | null
  >(null);

  const [cashOutPaymentMethodId, setCashOutPaymentMethodId] = useState("");
  const [cashOutAccountId, setCashOutAccountId] = useState("");

  const [arcaVoucherKind, setArcaVoucherKind] = useState<"A" | "B" | "C">(
    "B",
  );
  const [arcaAuthorizationCode, setArcaAuthorizationCode] = useState("");
  const [arcaPointOfSale, setArcaPointOfSale] = useState("");
  const [arcaValidationResult, setArcaValidationResult] = useState<{
    status: string;
    message: string;
    checkedAt: string;
    comprobante: PurchaseArcaVoucherSnapshot | null;
  } | null>(null);

  const now = new Date();
  const [reportFrom, setReportFrom] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [reportTo, setReportTo] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  );

  const [purchaseView, setPurchaseView] = useState<"new" | "list">("new");
  const [openPurchaseSection, setOpenPurchaseSection] =
    useState<PurchaseSectionId>("supplier");
  const [pendingPurchase, setPendingPurchase] = useState<PreparedPurchase | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArcaValidating, setIsArcaValidating] = useState(false);
  const [revalidatingPurchaseId, setRevalidatingPurchaseId] = useState<
    string | null
  >(null);
  const [highlightedFields, setHighlightedFields] = useState<
    Partial<Record<PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed", true>>
  >({});
  const [highlightedSection, setHighlightedSection] =
    useState<PurchaseSectionId | null>(null);
  const supplierMatchesCacheRef = useRef<Map<string, SupplierOption[]>>(
    new Map(),
  );
  const productMatchesCacheRef = useRef<Map<string, ProductOption[]>>(
    new Map(),
  );
  const fieldHighlightTimeoutRef = useRef<number | null>(null);
  const sectionHighlightTimeoutRef = useRef<number | null>(null);

  const productMap = useMemo(
    () => new Map(Object.values(selectedProductsById).map((product) => [product.id, product])),
    [selectedProductsById],
  );

  const getProductMatches = (value: string) => {
    const normalized = normalizeQuery(value);
    return productMatchesByQuery[normalized] ?? [];
  };
  const getJurisdictionMatches = (value: string) =>
    suggestJurisdictions(value, 8);

  const arcaEnabled = hasInvoice;
  const impactCurrentAccount = paymentMode === "CURRENT_ACCOUNT";
  const registerCashOut = paymentMode === "IMMEDIATE_CASH_OUT";
  const paymentModeLabel =
    PURCHASE_PAYMENT_MODE_OPTIONS.find((option) => option.value === paymentMode)
      ?.label ?? "Sin impacto";

  const highlightFields = (
    fields: Array<PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed">,
  ) => {
    if (!fields.length) return;
    setHighlightedFields(
      fields.reduce(
        (accumulator, field) => ({ ...accumulator, [field]: true }),
        {} as Partial<
          Record<
            PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed",
            true
          >
        >,
      ),
    );
    if (fieldHighlightTimeoutRef.current) {
      window.clearTimeout(fieldHighlightTimeoutRef.current);
    }
    fieldHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedFields({});
      fieldHighlightTimeoutRef.current = null;
    }, 3200);
  };

  const highlightSection = (section: PurchaseSectionId) => {
    setHighlightedSection(section);
    if (sectionHighlightTimeoutRef.current) {
      window.clearTimeout(sectionHighlightTimeoutRef.current);
    }
    sectionHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSection(null);
      sectionHighlightTimeoutRef.current = null;
    }, 3200);
  };

  const getHighlightClass = (
    field: PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed",
  ) =>
    highlightedFields[field]
      ? "border-rose-400 ring-2 ring-rose-200 focus-visible:ring-rose-300/60"
      : "";

  const loadPurchases = async () => {
    const res = await fetch("/api/purchases", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PurchaseRow[];
      setPurchases(data);
    }
  };

  const loadFinance = async () => {
    const [methodsRes, accountsRes, currenciesRes, ratesRes, meRes] =
      await Promise.all([
        fetch("/api/payment-methods", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/currencies", { cache: "no-store" }),
        fetch("/api/config/exchange-rate", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

    if (methodsRes.ok) {
      const data = (await methodsRes.json()) as PaymentMethodOption[];
      setPaymentMethods(data.filter((method) => method.isActive !== false));
    }
    if (accountsRes.ok) {
      const data = (await accountsRes.json()) as AccountOption[];
      setAccounts(data.filter((account) => account.isActive !== false));
    }
    if (currenciesRes.ok) {
      const data = (await currenciesRes.json()) as CurrencyOption[];
      setCurrencies(data);
    }
    if (ratesRes.ok) {
      const data = (await ratesRes.json()) as Array<{
        baseCode: string;
        quoteCode: string;
        rate: string | number;
      }>;
      const latestUsd = data.find(
        (rate) => rate.baseCode === "USD" && rate.quoteCode === "ARS",
      );
      if (latestUsd) {
        setLatestUsdRate(latestUsd.rate.toString());
      }
    }
    if (meRes.ok) {
      const data = (await meRes.json()) as { role?: string };
      setRole(data.role ?? null);
    }
  };

  useEffect(() => {
    loadPurchases().catch(() => undefined);
    loadFinance().catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (fieldHighlightTimeoutRef.current) {
        window.clearTimeout(fieldHighlightTimeoutRef.current);
      }
      if (sectionHighlightTimeoutRef.current) {
        window.clearTimeout(sectionHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSupplierOpen) return;
    const normalized = normalizeQuery(supplierSearch);
    const timeoutId = window.setTimeout(async () => {
      if (supplierMatchesCacheRef.current.has(normalized)) {
        setSupplierMatches(supplierMatchesCacheRef.current.get(normalized) ?? []);
        return;
      }

      setIsSupplierMatchesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "8");
        params.set("offset", "0");
        params.set("sort", "az");
        if (normalized) {
          params.set("q", normalized);
        }
        const res = await fetch(`/api/suppliers?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: SupplierOption[];
        };
        supplierMatchesCacheRef.current.set(normalized, data.items);
        setSupplierMatches(data.items);
      } finally {
        setIsSupplierMatchesLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isSupplierOpen, supplierSearch]);

  useEffect(() => {
    if (openProductIndex === null) return;
    const normalized = normalizeQuery(
      purchaseProducts[openProductIndex]?.productSearch ?? "",
    );
    const timeoutId = window.setTimeout(async () => {
      if (productMatchesCacheRef.current.has(normalized)) {
        const cached = productMatchesCacheRef.current.get(normalized) ?? [];
        setProductMatchesByQuery((previous) =>
          previous[normalized] ? previous : { ...previous, [normalized]: cached },
        );
        return;
      }

      setIsProductMatchesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "8");
        params.set("offset", "0");
        params.set("sort", "az");
        if (normalized) {
          params.set("q", normalized);
        }
        const res = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: ProductOption[];
        };
        productMatchesCacheRef.current.set(normalized, data.items);
        setProductMatchesByQuery((previous) => ({
          ...previous,
          [normalized]: data.items,
        }));
      } finally {
        setIsProductMatchesLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [openProductIndex, purchaseProducts]);

  const handleSupplierSearchChange = (value: string) => {
    setSupplierSearch(value);
    setSupplierId("");
    setSelectedSupplier(null);
    setSelectedSupplierTaxId("");
    setSupplierDataStatus(null);
    setIsSupplierOpen(true);
    setSupplierActiveIndex(0);
  };

  const handleSupplierSelect = (supplier: SupplierOption) => {
    setSupplierId(supplier.id);
    setSelectedSupplier(supplier);
    setSelectedSupplierTaxId(normalizeTaxId(supplier.taxId ?? ""));
    setSupplierDataStatus(null);
    setSupplierSearch(formatSupplierLabel(supplier));
    setIsSupplierOpen(false);
  };

  const handleSupplierKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!supplierMatches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isSupplierOpen) {
        setIsSupplierOpen(true);
        setSupplierActiveIndex(0);
        return;
      }
      setSupplierActiveIndex((prev) =>
        Math.min(prev + 1, supplierMatches.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isSupplierOpen) {
        setIsSupplierOpen(true);
        setSupplierActiveIndex(supplierMatches.length - 1);
        return;
      }
      setSupplierActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (!isSupplierOpen) return;
      event.preventDefault();
      const candidate = supplierMatches[supplierActiveIndex];
      if (candidate) {
        handleSupplierSelect(candidate);
      }
    }

    if (event.key === "Escape") {
      setIsSupplierOpen(false);
    }
  };

  const mergeSupplier = (supplier: SupplierOption) => {
    setSelectedSupplier(supplier);
    setSupplierSearch(formatSupplierLabel(supplier));
    setSupplierMatches((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]));
      byId.set(supplier.id, supplier);
      return Array.from(byId.values());
    });
    supplierMatchesCacheRef.current.clear();
  };

  const updateSelectedSupplier = async (patch: {
    taxId?: string;
    legalName?: string | null;
    address?: string | null;
  }) => {
    if (!selectedSupplier) return null;

    setSupplierDataStatus(null);
    setIsUpdatingSelectedSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSupplier.id,
          displayName: selectedSupplier.displayName,
          legalName:
            patch.legalName !== undefined
              ? patch.legalName || undefined
              : selectedSupplier.legalName ?? undefined,
          taxId:
            patch.taxId !== undefined
              ? normalizeTaxId(patch.taxId) || undefined
              : selectedSupplier.taxId ?? undefined,
          email: selectedSupplier.email ?? undefined,
          phone: selectedSupplier.phone ?? undefined,
          address:
            patch.address !== undefined
              ? patch.address || undefined
              : selectedSupplier.address ?? undefined,
        }),
      });
      const data = (await res.json()) as SupplierOption | { error?: string };
      if (!res.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No se pudo actualizar proveedor";
        setSupplierDataStatus(errorMessage);
        return null;
      }

      const updatedSupplier = data as SupplierOption;
      mergeSupplier(updatedSupplier);
      setSelectedSupplierTaxId(normalizeTaxId(updatedSupplier.taxId ?? ""));
      setSupplierDataStatus("Proveedor actualizado.");
      return updatedSupplier;
    } catch {
      setSupplierDataStatus("No se pudo actualizar proveedor");
      return null;
    } finally {
      setIsUpdatingSelectedSupplier(false);
    }
  };

  const handleSaveSelectedSupplierTaxId = async () => {
    await updateSelectedSupplier({ taxId: selectedSupplierTaxId });
  };

  const handleLookupAndSaveSelectedSupplier = async () => {
    if (!selectedSupplier) return;
    const taxId = normalizeTaxId(selectedSupplierTaxId);
    if (!taxId) {
      setSupplierDataStatus("Ingresa un CUIT para buscar.");
      return;
    }

    setSupplierDataStatus(null);
    setIsUpdatingSelectedSupplier(true);
    try {
      const res = await fetch("/api/arca/taxpayer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupplierDataStatus(data?.error ?? "No se pudo consultar ARCA");
        return;
      }

      const taxpayer = data?.taxpayer;
      const legalName =
        typeof taxpayer?.legalName === "string"
          ? taxpayer.legalName
          : typeof taxpayer?.displayName === "string"
            ? taxpayer.displayName
            : null;
      const address =
        typeof taxpayer?.address === "string" ? taxpayer.address : null;

      const updatedSupplier = await updateSelectedSupplier({
        taxId,
        legalName: legalName ?? selectedSupplier.legalName ?? null,
        address: address ?? selectedSupplier.address ?? null,
      });
      if (updatedSupplier) {
        const source =
          typeof data?.source === "string" ? ` (${data.source})` : "";
        setSupplierDataStatus(`Datos ARCA actualizados${source}.`);
      }
    } catch {
      setSupplierDataStatus("No se pudo consultar ARCA");
    } finally {
      setIsUpdatingSelectedSupplier(false);
    }
  };

  const handleVerifySelectedSupplier = async () => {
    if (!selectedSupplier) return;
    if (!normalizeTaxId(selectedSupplier.taxId ?? selectedSupplierTaxId)) {
      setSupplierDataStatus("Carga CUIT antes de verificar.");
      return;
    }

    setSupplierDataStatus(null);
    setIsVerifyingSelectedSupplier(true);
    try {
      const res = await fetch("/api/suppliers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          taxId: normalizeTaxId(selectedSupplierTaxId) || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupplierDataStatus(data?.error ?? "No se pudo verificar");
        return;
      }

      const updatedSupplier: SupplierOption = {
        ...selectedSupplier,
        taxId: typeof data?.taxId === "string" ? data.taxId : selectedSupplier.taxId,
        arcaVerificationStatus:
          typeof data?.status === "string"
            ? data.status
            : selectedSupplier.arcaVerificationStatus,
        arcaVerificationCheckedAt:
          typeof data?.checkedAt === "string"
            ? data.checkedAt
            : selectedSupplier.arcaVerificationCheckedAt,
        arcaVerificationMessage:
          typeof data?.message === "string"
            ? data.message
            : selectedSupplier.arcaVerificationMessage,
      };
      mergeSupplier(updatedSupplier);
      setSelectedSupplierTaxId(normalizeTaxId(updatedSupplier.taxId ?? ""));
      setSupplierDataStatus(`ARCA: ${data.status} - ${data.message}`);
    } catch {
      setSupplierDataStatus("No se pudo verificar");
    } finally {
      setIsVerifyingSelectedSupplier(false);
    }
  };

  const handlePurchaseProductChange = (
    index: number,
    field: keyof PurchaseProductForm,
    value: string,
  ) => {
    setPurchaseProducts((previous) => {
      const next = [...previous];
      const updated = { ...next[index], [field]: value };
      if (field === "productSearch") {
        updated.productId = "";
      }
      next[index] = updated;
      return next;
    });
  };

  const handleSelectPurchaseProduct = (index: number, product: ProductOption) => {
    setPurchaseProducts((previous) => {
      const next = [...previous];
      next[index] = {
        ...next[index],
        productId: product.id,
        productSearch: formatProductLabel(product),
        unitCost: next[index].unitCost || product.cost || "",
      };
      return next;
    });
    setSelectedProductsById((previous) => ({
      ...previous,
      [product.id]: product,
    }));
    setOpenProductIndex(null);
  };

  const handlePurchaseProductKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: ProductOption[],
  ) => {
    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (openProductIndex !== index) {
        setOpenProductIndex(index);
        setProductActiveIndex(0);
        return;
      }
      setProductActiveIndex((prev) => Math.min(prev + 1, matches.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (openProductIndex !== index) {
        setOpenProductIndex(index);
        setProductActiveIndex(matches.length - 1);
        return;
      }
      setProductActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (openProductIndex !== index) return;
      event.preventDefault();
      const candidate = matches[productActiveIndex];
      if (candidate) {
        handleSelectPurchaseProduct(index, candidate);
      }
    }

    if (event.key === "Escape") {
      setOpenProductIndex(null);
    }
  };

  const applyFiscalJurisdictionSuggestion = (index: number, value: string) => {
    handleFiscalLineChange(index, "jurisdiction", normalizeJurisdiction(value));
    setOpenJurisdictionIndex(null);
  };

  const handleFiscalJurisdictionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: readonly string[],
  ) => {
    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (openJurisdictionIndex !== index) {
        setOpenJurisdictionIndex(index);
        setJurisdictionActiveIndex(0);
        return;
      }
      setJurisdictionActiveIndex((prev) => Math.min(prev + 1, matches.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (openJurisdictionIndex !== index) {
        setOpenJurisdictionIndex(index);
        setJurisdictionActiveIndex(matches.length - 1);
        return;
      }
      setJurisdictionActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (openJurisdictionIndex !== index) return;
      event.preventDefault();
      const candidate = matches[jurisdictionActiveIndex];
      if (candidate) {
        applyFiscalJurisdictionSuggestion(index, candidate);
      }
    }

    if (event.key === "Escape") {
      setOpenJurisdictionIndex(null);
    }
  };

  const addPurchaseProduct = () => {
    setPurchaseProducts((previous) => [...previous, emptyPurchaseProduct()]);
  };

  const removePurchaseProduct = (index: number) => {
    setPurchaseProducts((previous) => {
      if (previous.length === 1) return previous;
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleCreateProductFromPurchase = async (index: number) => {
    const name = purchaseProducts[index]?.productSearch.trim();
    if (!name || name.length < 2) {
      setStatus("Escribe un nombre de producto para crearlo");
      return;
    }

    setStatus(null);
    setCreatingProductIndex(index);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as ProductOption | { error?: string };
      if (!res.ok) {
        setStatus(
          "error" in data && data.error ? data.error : "No se pudo crear producto",
        );
        return;
      }

      const product = data as ProductOption;
      handleSelectPurchaseProduct(index, product);
      setProductMatchesByQuery((previous) => {
        const normalized = normalizeQuery(name);
        const current = previous[normalized] ?? [];
        return { ...previous, [normalized]: [product, ...current] };
      });
      productMatchesCacheRef.current.clear();
    } catch {
      setStatus("No se pudo crear producto");
    } finally {
      setCreatingProductIndex(null);
    }
  };

  const handleFiscalLineChange = (
    index: number,
    field: keyof PurchaseFiscalLineForm,
    value: string,
  ) => {
    setFiscalLines((previous) => {
      const next = [...previous];
      const updated = { ...next[index], [field]: value } as PurchaseFiscalLineForm;
      if (field === "amount") {
        const hasManualAmount = value.trim().length > 0;
        updated.manualAmountOverride = hasManualAmount;
        if (!hasManualAmount) {
          const autoAmount = calculateFiscalLineAmount(
            parseOptionalNumber(updated.baseAmount),
            parseOptionalNumber(updated.rate),
          );
          updated.amount = autoAmount !== null ? toMoneyValue(autoAmount) : "";
        }
      }

      if ((field === "baseAmount" || field === "rate") && !updated.manualAmountOverride) {
        const baseAmount = parseOptionalNumber(updated.baseAmount);
        const rate = parseOptionalNumber(updated.rate);
        const autoAmount = calculateFiscalLineAmount(baseAmount, rate);
        updated.amount = autoAmount !== null ? toMoneyValue(autoAmount) : "";
      }
      next[index] = updated;
      return next;
    });
  };

  const addFiscalLine = () => {
    setFiscalLines((previous) => [...previous, emptyFiscalLine()]);
  };

  const removeFiscalLine = (index: number) => {
    setFiscalLines((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const buildArcaPayload = () => {
    if (!hasInvoice) return null;
    const amount = parsePositiveNumber(effectiveTotalAmount);
    if (!invoiceDate || !amount || !arcaAuthorizationCode.trim()) return null;

    const normalizedInvoiceNumber = invoiceNumber.trim();
    if (!normalizedInvoiceNumber) return null;

    const payload: Record<string, string | number> = {
      voucherKind: arcaVoucherKind,
      invoiceNumber: normalizedInvoiceNumber,
      voucherDate: invoiceDate,
      totalAmount: amount,
      authorizationCode: arcaAuthorizationCode.trim(),
    };

    if (arcaPointOfSale.trim()) {
      payload.pointOfSale = Number(arcaPointOfSale);
    }

    return payload;
  };

  const handleValidateArcaOnly = async () => {
    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      toast.error("Selecciona un proveedor antes de validar ARCA.");
      return;
    }
    const payload = buildArcaPayload();
    if (!payload) {
      setStatus("Completa los datos del comprobante para validar con ARCA.");
      toast.error("Completa los datos del comprobante para validar con ARCA.");
      return;
    }

    setStatus(null);
    setIsArcaValidating(true);
    try {
      const res = await fetch("/api/purchases/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          supplierId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo validar con ARCA";
        setStatus(message);
        toast.error(message);
        return;
      }

      setArcaValidationResult({
        status: data.status,
        message: data.message,
        checkedAt: data.checkedAt,
        comprobante: (data.comprobante ?? null) as PurchaseArcaVoucherSnapshot | null,
      });
      setStatus(`ARCA: ${arcaStatusLabel(data.status)}`);
      toast.success(`ARCA: ${arcaStatusLabel(data.status)}`);
    } catch {
      setStatus("No se pudo validar con ARCA");
      toast.error("No se pudo validar con ARCA.");
    } finally {
      setIsArcaValidating(false);
    }
  };

  const normalizedPurchaseProducts = useMemo(() => {
    return purchaseProducts
      .map((item) => ({
        productId: item.productId,
        qty: parseOptionalNumber(item.qty),
        unitCost: parseOptionalNumber(item.unitCost),
        taxRate: parseOptionalNumber(item.taxRate) ?? 0,
      }))
      .filter(
        (item): item is {
          productId: string;
          qty: number;
          unitCost: number;
          taxRate: number;
        } =>
          Boolean(item.productId) &&
          item.qty !== null &&
          Number.isFinite(item.qty) &&
          item.qty > 0 &&
          item.unitCost !== null &&
          Number.isFinite(item.unitCost) &&
          item.unitCost >= 0 &&
          Number.isFinite(item.taxRate) &&
          item.taxRate >= 0 &&
          item.taxRate <= 100,
      );
  }, [purchaseProducts]);

  const productTotals = useMemo(() => {
    return normalizedPurchaseProducts.reduce(
      (totals, item) => {
        const subtotal = item.qty * item.unitCost;
        const tax = subtotal * (item.taxRate / 100);
        return {
          subtotal: totals.subtotal + subtotal,
          tax: totals.tax + tax,
          total: totals.total + subtotal + tax,
        };
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
  }, [normalizedPurchaseProducts]);

  const hasPurchaseProductTotals =
    includeProductDetails && normalizedPurchaseProducts.length > 0;

  const normalizedFiscalLines = useMemo(() => {
    return fiscalLines
      .map((line) => ({
        type: line.type,
        jurisdiction: normalizeJurisdiction(line.jurisdiction) || undefined,
        baseAmount: parseOptionalNumber(line.baseAmount),
        rate: parseOptionalNumber(line.rate),
        amount: parseOptionalNumber(line.amount),
        note: line.note.trim() || undefined,
      }))
      .filter((line) => line.amount !== null && line.amount > 0);
  }, [fiscalLines]);

  const fiscalOtherTotal = normalizedFiscalLines.reduce(
    (sum, line) => sum + (line.amount ?? 0),
    0,
  );
  const simpleNetValue = Math.max(parseOptionalNumber(simpleNetAmount) ?? 0, 0);
  const simpleVatInputValue = Math.max(parseOptionalNumber(purchaseVatAmount) ?? 0, 0);
  const effectivePurchaseVatAmount =
    simpleFiscalCondition === "GRAVADO" ? purchaseVatAmount : "0";
  const simpleVatValue =
    simpleFiscalCondition === "GRAVADO" ? simpleVatInputValue : 0;
  const simpleNetTaxed = simpleFiscalCondition === "GRAVADO" ? simpleNetValue : 0;
  const simpleNetNonTaxed =
    simpleFiscalCondition === "NO_GRAVADO" ? simpleNetValue : 0;
  const simpleExempt = simpleFiscalCondition === "EXENTO" ? simpleNetValue : 0;
  const simpleTotal = roundMoney(
    simpleNetTaxed + simpleNetNonTaxed + simpleExempt + simpleVatValue + fiscalOtherTotal,
  );
  const advancedNetTaxed = Math.max(parseOptionalNumber(netTaxedAmount) ?? 0, 0);
  const advancedNetNonTaxed = Math.max(parseOptionalNumber(netNonTaxedAmount) ?? 0, 0);
  const advancedExempt = Math.max(parseOptionalNumber(exemptAmount) ?? 0, 0);
  const advancedTotal = roundMoney(
    advancedNetTaxed + advancedNetNonTaxed + advancedExempt + simpleVatValue + fiscalOtherTotal,
  );
  const hasAdvancedData =
    netTaxedAmount.trim() || netNonTaxedAmount.trim() || exemptAmount.trim();
  const effectiveTotalAmount = showFiscalDetail
    ? hasAdvancedData || fiscalOtherTotal > 0
      ? toMoneyValue(advancedTotal)
      : ""
    : simpleNetAmount.trim() || fiscalOtherTotal > 0
      ? toMoneyValue(simpleTotal)
      : "";

  const autoTotalsFromProducts = useMemo(
    () =>
      calculateAutoTotalsFromProducts({
        subtotal: productTotals.subtotal,
        vat: productTotals.tax,
        fiscalOtherTotal,
      }),
    [fiscalOtherTotal, productTotals.subtotal, productTotals.tax],
  );

  useEffect(() => {
    if (totalsSource !== "AUTO_FROM_PRODUCTS" || !includeProductDetails) {
      return;
    }
    if (!hasPurchaseProductTotals) {
      setSimpleNetAmount("");
      setPurchaseVatAmount("");
      setNetTaxedAmount("");
      setSimpleFiscalCondition("GRAVADO");
      return;
    }
    setSimpleFiscalCondition("GRAVADO");
    setSimpleNetAmount(toMoneyValue(autoTotalsFromProducts.netTaxed));
    setPurchaseVatAmount(toMoneyValue(autoTotalsFromProducts.vat));
    setNetTaxedAmount(toMoneyValue(autoTotalsFromProducts.netTaxed));
  }, [
    autoTotalsFromProducts.netTaxed,
    autoTotalsFromProducts.total,
    autoTotalsFromProducts.vat,
    hasPurchaseProductTotals,
    includeProductDetails,
    totalsSource,
  ]);
  const fiscalPreview = useMemo(() => {
    const total = parseOptionalNumber(effectiveTotalAmount) ?? 0;
    const vat = showFiscalDetail
      ? (parseOptionalNumber(effectivePurchaseVatAmount) ?? 0)
      : simpleVatValue;
    const netTaxed = showFiscalDetail
      ? (parseOptionalNumber(netTaxedAmount) ?? 0)
      : simpleNetTaxed;
    const netNonTaxed = showFiscalDetail
      ? (parseOptionalNumber(netNonTaxedAmount) ?? 0)
      : simpleNetNonTaxed;
    const exempt = showFiscalDetail
      ? (parseOptionalNumber(exemptAmount) ?? 0)
      : simpleExempt;
    const fiscalTotal = netTaxed + netNonTaxed + exempt + vat + fiscalOtherTotal;
    return {
      total,
      vat,
      netTaxed,
      netNonTaxed,
      exempt,
      fiscalTotal,
      difference: total - fiscalTotal,
    };
  }, [
    effectivePurchaseVatAmount,
    exemptAmount,
    fiscalOtherTotal,
    netNonTaxedAmount,
    netTaxedAmount,
    effectiveTotalAmount,
    simpleExempt,
    simpleNetNonTaxed,
    simpleNetTaxed,
    simpleVatValue,
    showFiscalDetail,
  ]);
  const fiscalDifferenceOk = Math.abs(fiscalPreview.difference) <= 0.01;
  const fiscalSummaryItems = [
    { label: "Neto", value: fiscalPreview.netTaxed },
    { label: "IVA", value: fiscalPreview.vat },
    { label: "Perc./otros", value: fiscalOtherTotal },
    { label: "Total fiscal", value: fiscalPreview.fiscalTotal },
    { label: "Diferencia", value: fiscalPreview.difference },
  ];
  const enableFiscalEditor = () => {
    if (!showFiscalDetail) {
      setNetTaxedAmount(toMoneyValue(simpleNetTaxed));
      setNetNonTaxedAmount(toMoneyValue(simpleNetNonTaxed));
      setExemptAmount(toMoneyValue(simpleExempt));
    }
    setShowFiscalDetail(true);
  };
  const toggleFiscalEditor = () => {
    if (showFiscalDetail) {
      setShowFiscalDetail(false);
      return;
    }
    enableFiscalEditor();
  };
  const addFiscalLineAndOpen = () => {
    setOpenPurchaseSection("taxes");
    addFiscalLine();
  };
  const validateArcaConsistency = (total: number) => {
    if (!arcaEnabled || !arcaValidationResult?.comprobante) return true;
    const mismatches = compareArcaVoucherAgainstForm({
      form: {
        voucherKind: arcaVoucherKind,
        pointOfSale: arcaPointOfSale,
        invoiceNumber,
        invoiceDate,
        totalAmount: total,
        authorizationCode: arcaAuthorizationCode,
      },
      arca: arcaValidationResult.comprobante,
    });
    if (!mismatches.length) return true;

    const message = summarizeArcaMismatches(mismatches);
    setStatus(message);
    toast.error(message);
    const targetSection = mismatches.some((item) => item.section === "invoice")
      ? "invoice"
      : "totals";
    setOpenPurchaseSection(targetSection);
    highlightSection(targetSection);
    highlightFields(mismatches.map((item) => item.field));
    return false;
  };

  const supplierSectionSummary = supplierId
    ? `${selectedSupplier?.displayName ?? supplierSearch} · ${formatDateInputLabel(
        invoiceDate,
      )}`
    : `Sin proveedor · ${formatDateInputLabel(invoiceDate)}`;
  const invoiceSectionSummary = hasInvoice
    ? invoiceNumber.trim()
      ? `Factura ${arcaVoucherKind} · ${invoiceNumber.trim()}`
      : `Factura ${arcaVoucherKind} pendiente`
    : "Sin factura";
  const productsSectionSummary = includeProductDetails
    ? `${normalizedPurchaseProducts.length} items · ${formatCurrencyARS(
        productTotals.total,
      )}`
    : "Sin detalle de productos";
  const totalsSectionSummary = fiscalPreview.total
    ? `${totalsSource === "AUTO_FROM_PRODUCTS" ? "Auto" : "Manual"} · ${formatCurrencyARS(
        fiscalPreview.total,
      )} · diferencia ${formatCurrencyARS(fiscalPreview.difference)}`
    : "Sin total";
  const taxesSectionSummary = fiscalLines.length
    ? `${fiscalLines.length} tributo${
        fiscalLines.length === 1 ? "" : "s"
      } · ${formatCurrencyARS(fiscalOtherTotal)}`
    : "Sin percepciones";
  const paymentSectionSummary = paymentModeLabel;

  const preparePurchaseForConfirmation = (): PreparedPurchase | null => {
    setStatus(null);
    const shouldAdjustStock = STOCK_ENABLED && adjustStock && includeProductDetails;

    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      setOpenPurchaseSection("supplier");
      highlightSection("supplier");
      return null;
    }

    const total = parsePositiveNumber(effectiveTotalAmount);
    if (!total) {
      setStatus("Ingresa un total valido");
      setOpenPurchaseSection("totals");
      highlightSection("totals");
      highlightFields(["totals.totalAmount"]);
      return null;
    }

    const vatAmount = parseOptionalNumber(effectivePurchaseVatAmount);
    if (vatAmount !== null && vatAmount < 0) {
      setStatus("IVA compra invalido");
      setOpenPurchaseSection("totals");
      highlightSection("totals");
      highlightFields(["totals.vatAmount"]);
      return null;
    }

    if (includeProductDetails) {
      const hasIncompleteProduct = purchaseProducts.some((item) => {
        const hasData = Boolean(
          item.productId ||
            item.productSearch.trim() ||
            item.unitCost.trim() ||
            item.qty.trim() !== "1" ||
            item.taxRate.trim() !== "21",
        );
        if (!hasData) return false;
        const qty = parseOptionalNumber(item.qty);
        const unitCost = parseOptionalNumber(item.unitCost);
        const taxRate = parseOptionalNumber(item.taxRate) ?? 0;
        return (
          !item.productId ||
          qty === null ||
          qty <= 0 ||
          unitCost === null ||
          unitCost < 0 ||
          taxRate < 0 ||
          taxRate > 100
        );
      });

      if (normalizedPurchaseProducts.length === 0 || hasIncompleteProduct) {
        setStatus("Completa producto, cantidad, costo e IVA en cada item");
        setOpenPurchaseSection("products");
        highlightSection("products");
        return null;
      }
      if (totalsSource === "AUTO_FROM_PRODUCTS" && !hasPurchaseProductTotals) {
        setStatus("Activa productos validos para sincronizar totales automaticamente");
        setOpenPurchaseSection("products");
        highlightSection("products");
        return null;
      }
    }

    let fiscalDetailPayload: FiscalDetailPayload | undefined;

    const shouldSaveFiscalDetail =
      showFiscalDetail ||
      fiscalLines.length > 0 ||
      simpleFiscalCondition !== "GRAVADO";
    if (shouldSaveFiscalDetail) {
      const netTaxed = showFiscalDetail
        ? (parseOptionalNumber(netTaxedAmount) ?? 0)
        : fiscalPreview.netTaxed;
      const netNonTaxed = showFiscalDetail
        ? (parseOptionalNumber(netNonTaxedAmount) ?? 0)
        : fiscalPreview.netNonTaxed;
      const exempt = showFiscalDetail
        ? (parseOptionalNumber(exemptAmount) ?? 0)
        : fiscalPreview.exempt;
      if (netTaxed < 0 || netNonTaxed < 0 || exempt < 0) {
        setStatus("Los netos fiscales no pueden ser negativos");
        setOpenPurchaseSection("totals");
        highlightSection("totals");
        highlightFields(["totals.netTaxed"]);
        return null;
      }
      const incompleteFiscalLine = fiscalLines.some((line) => {
        const hasData = Boolean(
          line.jurisdiction.trim() ||
            line.baseAmount.trim() ||
            line.rate.trim() ||
            line.amount.trim(),
        );
        const amount = parseOptionalNumber(line.amount);
        return hasData && (!amount || amount <= 0);
      });
      if (incompleteFiscalLine) {
        setStatus("Completa el importe de cada percepcion/tributo fiscal");
        setOpenPurchaseSection("taxes");
        highlightSection("taxes");
        return null;
      }
      const fiscalTotal =
        netTaxed + netNonTaxed + exempt + (vatAmount ?? 0) + fiscalOtherTotal;
      if (Math.abs(total - fiscalTotal) > 0.01) {
        setStatus("El detalle fiscal no coincide con el total de la compra");
        setOpenPurchaseSection("totals");
        highlightSection("totals");
        highlightFields(["totals.totalAmount", "totals.vatAmount", "totals.netTaxed"]);
        return null;
      }
      fiscalDetailPayload = {
        netTaxed,
        netNonTaxed,
        exemptAmount: exempt,
        vatTotal: vatAmount ?? 0,
        lines: normalizedFiscalLines.map((line) => ({
          type: line.type,
          jurisdiction: line.jurisdiction,
          baseAmount: line.baseAmount ?? undefined,
          rate: line.rate ?? undefined,
          amount: line.amount ?? 0,
          note: line.note,
        })),
      };
    }

    if (hasInvoice && !invoiceNumber.trim()) {
      setStatus("Ingresa numero de comprobante");
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      highlightFields(["invoice.invoiceNumber"]);
      return null;
    }

    if (shouldAdjustStock && normalizedPurchaseProducts.length === 0) {
      setStatus("Agrega productos para ingresar stock");
      setOpenPurchaseSection("products");
      return null;
    }

    if (registerCashOut && !cashOutPaymentMethodId) {
      setStatus("Selecciona un metodo de pago para el egreso");
      setOpenPurchaseSection("payment");
      return null;
    }

    if (registerCashOut && !cashOutAccountId) {
      setStatus("Selecciona una cuenta para registrar el egreso");
      setOpenPurchaseSection("payment");
      return null;
    }

    const arcaPayload = arcaEnabled ? buildArcaPayload() : null;
    if (arcaEnabled && !arcaPayload) {
      setStatus("Completa los datos del comprobante para validar ARCA");
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      return null;
    }
    if (arcaEnabled && !arcaValidationResult) {
      const message =
        "Valida el comprobante en ARCA antes de continuar con la confirmacion.";
      setStatus(message);
      toast.error(message);
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      return null;
    }
    if (!validateArcaConsistency(total)) {
      return null;
    }

    const payload: PurchasePayload = {
      supplierId,
      hasInvoice: arcaEnabled,
      invoiceNumber: arcaEnabled ? invoiceNumber || undefined : undefined,
      invoiceDate: invoiceDate || undefined,
      totalAmount: total,
      purchaseVatAmount: vatAmount ?? undefined,
      fiscalDetail: fiscalDetailPayload,
      impactCurrentAccount,
      items: includeProductDetails
        ? normalizedPurchaseProducts.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitCost: item.unitCost,
            taxRate: item.taxRate,
          }))
        : undefined,
      adjustStock: shouldAdjustStock,
      registerCashOut,
      cashOutPaymentMethodId: registerCashOut
        ? cashOutPaymentMethodId
        : undefined,
      cashOutAccountId: registerCashOut ? cashOutAccountId : undefined,
      validateWithArca: arcaEnabled,
      arcaValidation: arcaEnabled && arcaPayload ? { ...arcaPayload } : undefined,
    };

    return {
      payload,
      supplierLabel: selectedSupplier?.displayName ?? supplierSearch,
      dateLabel: formatDateInputLabel(invoiceDate),
      invoiceLabel: invoiceSectionSummary,
      paymentLabel: paymentModeLabel,
      total,
      vatAmount,
      productCount: normalizedPurchaseProducts.length,
      productTotal: productTotals.total,
      fiscalOtherTotal,
      fiscalDifference: fiscalPreview.difference,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prepared = preparePurchaseForConfirmation();
    if (!prepared) return;
    setPendingPurchase(prepared);
  };

  const handleConfirmPurchase = async () => {
    if (!pendingPurchase) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPurchase.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo guardar";
        setStatus(message);
        toast.error(message);
        return;
      }

      setSupplierSearch("");
      setSupplierId("");
      setSelectedSupplier(null);
      setSelectedSupplierTaxId("");
      setSupplierDataStatus(null);
      setHasInvoice(false);
      setInvoiceNumber("");
      setSimpleNetAmount("");
      setSimpleFiscalCondition("GRAVADO");
      setPurchaseVatAmount("");
      setTotalsSource("AUTO_FROM_PRODUCTS");
      setShowFiscalDetail(false);
      setNetTaxedAmount("");
      setNetNonTaxedAmount("");
      setExemptAmount("");
      setFiscalLines([]);
      setPaymentMode("OFF_BOOK");
      setIncludeProductDetails(false);
      setAdjustStock(false);
      setPurchaseProducts([emptyPurchaseProduct()]);
      setCashOutPaymentMethodId("");
      setCashOutAccountId("");
      setArcaVoucherKind("B");
      setArcaAuthorizationCode("");
      setArcaPointOfSale("");
      setArcaValidationResult(null);
      setHighlightedFields({});
      setHighlightedSection(null);
      setPendingPurchase(null);
      setOpenPurchaseSection("supplier");
      setStatus("Compra registrada");
      toast.success("Compra registrada.");
      await loadPurchases();
    } catch {
      setStatus("No se pudo guardar");
      toast.error("No se pudo guardar la compra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevalidatePurchase = async (purchaseId: string) => {
    setStatus(null);
    setRevalidatingPurchaseId(purchaseId);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/revalidate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo revalidar");
        return;
      }
      setStatus(`Comprobante revalidado (${arcaStatusLabel(data.status)})`);
      await loadPurchases();
    } catch {
      setStatus("No se pudo revalidar");
    } finally {
      setRevalidatingPurchaseId(null);
    }
  };

  const handleDownloadPurchasesReport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (reportFrom) params.set("from", reportFrom);
    if (reportTo) params.set("to", reportTo);
    window.location.href = `/api/purchases/report?${params.toString()}`;
  };

  const totalPurchases = purchases.length;
  const totalAmountRegistered = purchases.reduce((sum, purchase) => {
    const value = Number(purchase.total ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const impactCount = purchases.filter((purchase) => purchase.impactsAccount)
    .length;

  const filteredPurchases = useMemo(() => {
    const normalized = normalizeQuery(query);
    const next = purchases.filter((purchase) => {
      if (!normalized) return true;
      const haystack = normalizeQuery(
        `${purchase.supplierName} ${purchase.invoiceNumber ?? ""}`,
      );
      return haystack.includes(normalized);
    });

    next.sort((a, b) => {
      const aTime = new Date(a.invoiceDate ?? a.createdAt).getTime();
      const bTime = new Date(b.invoiceDate ?? b.createdAt).getTime();
      return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return next;
  }, [purchases, query, sortOrder]);

  const selectedSupplierVerificationStatus =
    selectedSupplier?.arcaVerificationStatus ?? "PENDING";
  const selectedSupplierEffectiveTaxId =
    normalizeTaxId(selectedSupplierTaxId) ||
    normalizeTaxId(selectedSupplier?.taxId ?? "");
  const selectedSupplierHasTaxId = Boolean(
    selectedSupplierEffectiveTaxId,
  );
  const shouldShowSupplierDataNotice = Boolean(
    selectedSupplier &&
      (!selectedSupplierHasTaxId ||
        selectedSupplierVerificationStatus !== "MATCH"),
  );
  const supplierNoticeTone =
    selectedSupplierVerificationStatus === "MISMATCH" ||
    selectedSupplierVerificationStatus === "NO_ENCONTRADO" ||
    selectedSupplierVerificationStatus === "ERROR"
      ? "rose"
      : "amber";
  const supplierNoticeMessage = !selectedSupplierHasTaxId
    ? "Falta CUIT para validar comprobantes y ordenar la ficha del proveedor."
    : selectedSupplierVerificationStatus === "PARTIAL"
      ? "La razon social tiene coincidencia parcial con ARCA."
      : selectedSupplierVerificationStatus === "MISMATCH"
        ? "La razon social no coincide con ARCA."
        : selectedSupplierVerificationStatus === "NO_ENCONTRADO"
          ? "ARCA no encontro un proveedor para ese CUIT. Revisa que este bien escrito."
          : selectedSupplierVerificationStatus === "ERROR"
            ? selectedSupplier?.arcaVerificationMessage ??
              "No se pudo verificar el proveedor."
            : "Proveedor pendiente de verificacion ARCA.";
  const supplierDataNotice = shouldShowSupplierDataNotice ? (
    <InlineDataNotice
      tone={supplierNoticeTone}
      title="Datos del proveedor"
      message={supplierNoticeMessage}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(140px,1fr)_auto]">
        <input
          className="input h-8 text-xs"
          value={selectedSupplierTaxId}
          onChange={(event) =>
            setSelectedSupplierTaxId(normalizeTaxId(event.target.value))
          }
          placeholder="CUIT"
          inputMode="numeric"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn h-8 px-2 text-[11px]"
            onClick={handleLookupAndSaveSelectedSupplier}
            disabled={isUpdatingSelectedSupplier}
          >
            {isUpdatingSelectedSupplier ? "Buscando..." : "Buscar ARCA"}
          </button>
          <button
            type="button"
            className="btn h-8 px-2 text-[11px]"
            onClick={handleSaveSelectedSupplierTaxId}
            disabled={isUpdatingSelectedSupplier}
          >
            Guardar
          </button>
          {selectedSupplierHasTaxId ? (
            <button
              type="button"
              className="btn h-8 px-2 text-[11px]"
              onClick={handleVerifySelectedSupplier}
              disabled={isVerifyingSelectedSupplier}
            >
              {isVerifyingSelectedSupplier ? "Verificando..." : "Verificar"}
            </button>
          ) : null}
        </div>
      </div>
      {supplierDataStatus ? (
        <p className="mt-1.5 text-[11px] text-zinc-500">
          {supplierDataStatus}
        </p>
      ) : null}
    </InlineDataNotice>
  ) : null;
  const confirmationRows = pendingPurchase
    ? [
        { label: "Proveedor", value: pendingPurchase.supplierLabel },
        { label: "Fecha", value: pendingPurchase.dateLabel },
        { label: "Factura", value: pendingPurchase.invoiceLabel },
        { label: "Total", value: formatCurrencyARS(pendingPurchase.total) },
        {
          label: "IVA",
          value:
            pendingPurchase.vatAmount !== null
              ? formatCurrencyARS(pendingPurchase.vatAmount)
              : "Sin IVA",
        },
        {
          label: "Productos",
          value: pendingPurchase.productCount
            ? `${pendingPurchase.productCount} item${
                pendingPurchase.productCount === 1 ? "" : "s"
              } · ${formatCurrencyARS(pendingPurchase.productTotal)}`
            : "Sin detalle",
        },
        {
          label: "Percepciones",
          value: formatCurrencyARS(pendingPurchase.fiscalOtherTotal),
        },
        {
          label: "Diferencia fiscal",
          value: formatCurrencyARS(pendingPurchase.fiscalDifference),
        },
        { label: "Pago", value: pendingPurchase.paymentLabel },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Compras</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Carga compras con o sin factura y registra egresos.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">Compras</span>
              <p className="text-base font-semibold text-zinc-900">
                {totalPurchases}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">
                Impactan cta. cte.
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {impactCount}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">
                Total registrado
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {formatCurrencyARS(totalAmountRegistered)}
              </p>
            </div>
          </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-grid w-full grid-cols-2 rounded-2xl border border-zinc-200/70 bg-white/55 p-1.5 sm:w-auto">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl border border-sky-200 bg-white shadow-[0_4px_10px_-8px_rgba(14,116,144,0.32)] transition-transform duration-200 ease-out ${
              purchaseView === "list" ? "translate-x-full" : ""
            }`}
          />
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors sm:px-6 sm:text-sm ${
              purchaseView === "new" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("new")}
            aria-pressed={purchaseView === "new"}
          >
            Nueva compra
          </button>
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors sm:px-6 sm:text-sm ${
              purchaseView === "list" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("list")}
            aria-pressed={purchaseView === "list"}
          >
            Compras
          </button>
        </div>
      </div>

      {purchaseView === "new" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Nueva compra</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <PurchaseSection
              title="Proveedor y comprobante"
              summary={supplierSectionSummary}
              open={openPurchaseSection === "supplier"}
              error={highlightedSection === "supplier"}
              onToggle={() => setOpenPurchaseSection("supplier")}
              className="order-1"
            >
              <div className="grid gap-4 md:grid-cols-3">
              <label className="field-stack min-w-0 w-full md:col-span-2">
                <span className="input-label">Proveedor</span>
                <div className="relative">
                  <input
                    className="input w-full"
                    value={supplierSearch}
                    onChange={(event) =>
                      handleSupplierSearchChange(event.target.value)
                    }
                    onFocus={() => {
                      setIsSupplierOpen(true);
                      setSupplierActiveIndex(0);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setIsSupplierOpen(false), 120);
                    }}
                    onKeyDown={handleSupplierKeyDown}
                    placeholder="Buscar proveedor por nombre o CUIT"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-expanded={isSupplierOpen}
                    aria-controls="purchase-supplier-options"
                    aria-activedescendant={
                      isSupplierOpen && supplierMatches[supplierActiveIndex]
                        ? `purchase-supplier-option-${
                            supplierMatches[supplierActiveIndex].id
                          }`
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {isSupplierOpen ? (
                      <motion.div
                        key="purchase-supplier-options"
                        id="purchase-supplier-options"
                        role="listbox"
                        aria-label="Proveedores"
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                      >
                        {supplierMatches.length ? (
                          supplierMatches.map((supplier, matchIndex) => {
                            const isSelected = supplier.id === supplierId;
                            const isActive = matchIndex === supplierActiveIndex;
                            return (
                              <button
                                key={supplier.id}
                                type="button"
                                id={`purchase-supplier-option-${supplier.id}`}
                                role="option"
                                aria-selected={isSelected}
                                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                  isActive
                                    ? "bg-white text-sky-900"
                                    : isSelected
                                      ? "bg-white text-sky-900"
                                      : "hover:bg-white/70"
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleSupplierSelect(supplier);
                                }}
                              >
                                <span className="font-medium text-zinc-900">
                                  {supplier.displayName}
                                </span>
                                <span className="text-xs text-zinc-500">
                                  {supplier.taxId ?? "Sin CUIT"}
                                </span>
                              </button>
                            );
                          })
                        ) : isSupplierMatchesLoading ? (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            Buscando...
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            Sin resultados.
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                {supplierDataNotice}
              </label>

              <label className="field-stack min-w-0 w-full">
                <span className="input-label">Fecha comprobante</span>
                <input
                  type="date"
                  className={`input w-full min-w-0 cursor-pointer ${getHighlightClass("invoice.invoiceDate")}`}
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </label>
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Totales y detalle fiscal"
              summary={totalsSectionSummary}
              open={openPurchaseSection === "totals"}
              error={highlightedSection === "totals"}
              onToggle={() => setOpenPurchaseSection("totals")}
              className="order-4"
            >
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="field-stack min-w-0">
                    <span className="input-label">Neto</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                        $
                      </span>
                      <MoneyInput
                        className={`input no-spinner w-full pl-10 text-right tabular-nums ${getHighlightClass("totals.netTaxed")}`}
                        value={simpleNetAmount}
                        onValueChange={(value) => {
                          setSimpleNetAmount(value);
                          if (includeProductDetails && hasPurchaseProductTotals) {
                            setTotalsSource("MANUAL");
                          }
                        }}
                        placeholder="0,00"
                        maxDecimals={2}
                      />
                    </div>
                  </label>
                  <label className="field-stack min-w-0">
                    <span className="input-label">Condicion</span>
                    <select
                      className="input w-full min-w-0 cursor-pointer"
                      value={simpleFiscalCondition}
                      onChange={(event) => {
                        const next = event.target.value as SimpleFiscalCondition;
                        setSimpleFiscalCondition(next);
                        if (next !== "GRAVADO") {
                          setPurchaseVatAmount("0");
                        }
                        if (includeProductDetails && hasPurchaseProductTotals) {
                          setTotalsSource("MANUAL");
                        }
                      }}
                    >
                      {SIMPLE_FISCAL_CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-stack min-w-0">
                    <span className="input-label">IVA compra</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                        $
                      </span>
                      <MoneyInput
                        className={`input no-spinner w-full pl-10 text-right tabular-nums ${getHighlightClass("totals.vatAmount")}`}
                        value={
                          simpleFiscalCondition === "GRAVADO"
                            ? purchaseVatAmount
                            : "0"
                        }
                        onValueChange={(value) => {
                          if (simpleFiscalCondition !== "GRAVADO") {
                            return;
                          }
                          setPurchaseVatAmount(value);
                          if (includeProductDetails && hasPurchaseProductTotals) {
                            setTotalsSource("MANUAL");
                          }
                        }}
                        placeholder="0,00"
                        maxDecimals={2}
                        readOnly={simpleFiscalCondition !== "GRAVADO"}
                      />
                    </div>
                  </label>
                  <div className="field-stack min-w-0">
                    <span className="input-label text-right">Total compra</span>
                    <div className="flex min-h-11 w-full items-center justify-end text-right text-lg font-semibold tabular-nums text-zinc-900">
                      {effectiveTotalAmount
                        ? formatCurrencyARS(parseOptionalNumber(effectiveTotalAmount) ?? 0)
                        : "0,00"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    {totalsSource === "MANUAL" && hasPurchaseProductTotals ? (
                      <p className="text-[11px] font-medium text-amber-700">
                        Origen de totales - Manual (Auto desde productos pausado por
                        modificacion).
                      </p>
                    ) : null}
                    {totalsSource === "AUTO_FROM_PRODUCTS" && !hasPurchaseProductTotals ? (
                      <p className="text-xs text-amber-700">
                        Carga al menos un producto completo para calcular total e IVA en modo
                        automatico.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`btn text-xs ${showFiscalDetail ? "" : "btn-sky"}`}
                    onClick={toggleFiscalEditor}
                  >
                    {showFiscalDetail ? "Ocultar avanzado" : "Avanzado"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showFiscalDetail ? (
                    <motion.div
                      key="purchase-fiscal-editor"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="field-stack min-w-0">
                          <span className="input-label">Neto gravado</span>
                          <MoneyInput
                            className={`input no-spinner w-full min-w-0 text-right tabular-nums ${getHighlightClass("totals.netTaxed")}`}
                            value={netTaxedAmount}
                            onValueChange={(value) => {
                              setNetTaxedAmount(value);
                              if (includeProductDetails && hasPurchaseProductTotals) {
                                setTotalsSource("MANUAL");
                              }
                            }}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                        <label className="field-stack min-w-0">
                          <span className="input-label">No gravado</span>
                          <MoneyInput
                            className="input no-spinner w-full min-w-0 text-right tabular-nums"
                            value={netNonTaxedAmount}
                            onValueChange={setNetNonTaxedAmount}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                        <label className="field-stack min-w-0">
                          <span className="input-label">Exento</span>
                          <MoneyInput
                            className="input no-spinner w-full min-w-0 text-right tabular-nums"
                            value={exemptAmount}
                            onValueChange={setExemptAmount}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="grid gap-3 border-y border-zinc-200/70 py-3 sm:grid-cols-2 lg:grid-cols-5">
                  {fiscalSummaryItems.map((item) => {
                    const isDifference = item.label === "Diferencia";
                    return (
                      <div key={item.label} className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          {item.label}
                        </span>
                        <span
                          className={`mt-1 block text-sm font-semibold tabular-nums ${
                            isDifference
                              ? fiscalDifferenceOk
                                ? "text-emerald-700"
                                : "text-rose-700"
                              : "text-zinc-900"
                          }`}
                        >
                          {formatCurrencyARS(item.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      fiscalDifferenceOk ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {fiscalDifferenceOk
                      ? "Total fiscal consistente"
                      : `Revisar diferencia ${formatCurrencyARS(
                          fiscalPreview.difference,
                        )}`}
                  </span>
                  <span className="text-zinc-500">
                    {fiscalLines.length
                      ? `${fiscalLines.length} tributo${
                          fiscalLines.length === 1 ? "" : "s"
                        } cargado${fiscalLines.length === 1 ? "" : "s"}`
                      : "Sin percepciones cargadas"}
                  </span>
                </div>

              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Productos"
              summary={productsSectionSummary}
              open={openPurchaseSection === "products"}
              error={highlightedSection === "products"}
              onToggle={() => setOpenPurchaseSection("products")}
              className="order-3"
            >
              <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Productos
                  </p>
                  <p className="text-xs text-zinc-500">
                    {includeProductDetails
                      ? `${normalizedPurchaseProducts.length} items · ${formatCurrencyARS(
                          productTotals.total,
                        )}`
                      : "Compra rápida sin detalle de productos"}
                  </p>
                </div>
                <MiniToggle
                  checked={includeProductDetails}
                  onChange={(next) => {
                    setIncludeProductDetails(next);
                    if (!next) {
                      setTotalsSource("MANUAL");
                      setAdjustStock(false);
                      setOpenProductIndex(null);
                    } else {
                      setTotalsSource("AUTO_FROM_PRODUCTS");
                    }
                  }}
                  label="Cargar productos"
                />
              </div>

              {includeProductDetails ? (
                <>
                  <div className="space-y-2">
                    {purchaseProducts.map((item, index) => {
                      const matches = getProductMatches(item.productSearch);
                      const isOpen = openProductIndex === index;
                      const selectedProduct = productMap.get(item.productId);
                      const qty = parseOptionalNumber(item.qty) ?? 0;
                      const unitCost = parseOptionalNumber(item.unitCost) ?? 0;
                      const taxRate = parseOptionalNumber(item.taxRate) ?? 0;
                      const lineSubtotal = qty * unitCost;
                      const lineTax = lineSubtotal * (taxRate / 100);
                      const lineTotal = lineSubtotal + lineTax;
                      const searchedProductName = item.productSearch.trim();
                      const canCreateProduct =
                        searchedProductName.length >= 2 &&
                        !matches.some(
                          (product) =>
                            normalizeQuery(product.name) ===
                              normalizeQuery(searchedProductName) ||
                            product.id === item.productId,
                        );

                      return (
                        <div
                          key={`purchase-product-${index}`}
                          className="grid gap-4 border-t border-zinc-200/70 py-3 first:border-t-0 lg:grid-cols-[minmax(220px,1fr)_96px_140px_112px_104px_40px] lg:items-start xl:grid-cols-[minmax(280px,1fr)_100px_148px_120px_112px_40px]"
                        >
                          <label className="field-stack min-w-0">
                            <span className="input-label">Producto</span>
                            <div className="relative">
                              <input
                                className="input w-full"
                                value={item.productSearch}
                                onChange={(event) => {
                                  handlePurchaseProductChange(
                                    index,
                                    "productSearch",
                                    event.target.value,
                                  );
                                  setOpenProductIndex(index);
                                  setProductActiveIndex(0);
                                }}
                                onFocus={() => {
                                  setOpenProductIndex(index);
                                  setProductActiveIndex(0);
                                }}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    setOpenProductIndex((current) =>
                                      current === index ? null : current,
                                    );
                                  }, 120);
                                }}
                                onKeyDown={(event) =>
                                  handlePurchaseProductKeyDown(
                                    event,
                                    index,
                                    matches,
                                  )
                                }
                                placeholder="Buscar o crear producto"
                                autoComplete="off"
                                role="combobox"
                                aria-autocomplete="list"
                                aria-haspopup="listbox"
                                aria-expanded={isOpen}
                                aria-controls={`purchase-product-options-${index}`}
                                aria-activedescendant={
                                  isOpen && matches[productActiveIndex]
                                    ? `purchase-product-option-${index}-${
                                        matches[productActiveIndex].id
                                      }`
                                    : undefined
                                }
                              />
                              <AnimatePresence>
                                {isOpen ? (
                                  <motion.div
                                    key={`purchase-product-options-${index}`}
                                    id={`purchase-product-options-${index}`}
                                    role="listbox"
                                    aria-label="Productos"
                                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                    transition={{
                                      duration: 0.18,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    className="absolute z-[90] mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200/70 bg-white/95 p-2 shadow-[0_14px_24px_-18px_rgba(82,82,91,0.45)] backdrop-blur-xl"
                                  >
                                    {matches.length ? (
                                      matches.map((product, matchIndex) => {
                                        const isSelected =
                                          product.id === item.productId;
                                        const isActive =
                                          matchIndex === productActiveIndex;
                                        return (
                                          <button
                                            key={product.id}
                                            type="button"
                                            id={`purchase-product-option-${index}-${product.id}`}
                                            role="option"
                                            aria-selected={isSelected}
                                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                                              isActive || isSelected
                                                ? "bg-sky-50 text-sky-950"
                                                : "hover:bg-zinc-50"
                                            }`}
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              handleSelectPurchaseProduct(
                                                index,
                                                product,
                                              );
                                            }}
                                          >
                                            <span className="min-w-0 truncate font-medium text-zinc-900">
                                              {formatProductLabel(product)}
                                            </span>
                                            <span className="shrink-0 text-xs text-zinc-500">
                                              {formatUnit(product.unit ?? null)}
                                            </span>
                                          </button>
                                        );
                                      })
                                    ) : isProductMatchesLoading ? (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        Buscando...
                                      </div>
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        Sin resultados.
                                      </div>
                                    )}
                                    {canCreateProduct ? (
                                      <button
                                        type="button"
                                        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-sky-200 px-3 py-2 text-left text-xs font-semibold text-sky-800 transition hover:bg-sky-50"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          handleCreateProductFromPurchase(index);
                                        }}
                                        disabled={creatingProductIndex === index}
                                      >
                                        <PlusIcon className="size-4" />
                                        {creatingProductIndex === index
                                          ? "Creando..."
                                          : `Crear "${searchedProductName}"`}
                                      </button>
                                    ) : null}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                            {selectedProduct?.unit ? (
                              <span className="text-[11px] text-zinc-500">
                                Unidad: {formatUnit(selectedProduct.unit)}
                              </span>
                            ) : null}
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Cantidad</span>
                            <input
                              className="input w-full min-w-0 text-right tabular-nums"
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(event) =>
                                handlePurchaseProductChange(
                                  index,
                                  "qty",
                                  normalizeDecimalInput(event.target.value, 3),
                                )
                              }
                              placeholder="0"
                            />
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Costo unit.</span>
                            <div className="relative min-w-0">
                              <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                                $
                              </span>
                              <MoneyInput
                                className="input no-spinner w-full min-w-0 pl-10 text-right tabular-nums"
                                value={item.unitCost}
                                onValueChange={(value) =>
                                  handlePurchaseProductChange(
                                    index,
                                    "unitCost",
                                    value,
                                  )
                                }
                                placeholder="0,00"
                                maxDecimals={2}
                              />
                            </div>
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">IVA</span>
                            <select
                              className="input w-full min-w-0 cursor-pointer text-right"
                              value={item.taxRate}
                              onChange={(event) =>
                                handlePurchaseProductChange(
                                  index,
                                  "taxRate",
                                  event.target.value,
                                )
                              }
                            >
                              {PURCHASE_ITEM_TAX_RATE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="field-stack min-w-0">
                            <span className="input-label">Total item</span>
                            <div className="flex h-10 items-center justify-end text-sm font-semibold tabular-nums text-zinc-900">
                              {formatCurrencyARS(lineTotal)}
                            </div>
                            <span className="text-right text-[11px] text-zinc-500">
                              IVA {formatCurrencyARS(lineTax)}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="btn btn-rose h-10 w-10 justify-center self-end p-0 text-xs"
                            onClick={() => removePurchaseProduct(index)}
                            disabled={purchaseProducts.length <= 1}
                            aria-label="Quitar producto"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-zinc-200/70 pt-3 md:flex-row md:items-center md:justify-between">
                    <div className="grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                      <span>
                        Neto:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.subtotal)}
                        </strong>
                      </span>
                      <span>
                        IVA:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.tax)}
                        </strong>
                      </span>
                      <span>
                        Total:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.total)}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {STOCK_ENABLED ? (
                        <MiniToggle
                          checked={adjustStock}
                          onChange={setAdjustStock}
                          label="Ingresar stock"
                        />
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sky text-xs"
                        onClick={addPurchaseProduct}
                      >
                        <PlusIcon className="size-4" />
                        Agregar producto
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Percepciones y otros tributos"
              summary={taxesSectionSummary}
              open={openPurchaseSection === "taxes"}
              error={highlightedSection === "taxes"}
              onToggle={() => setOpenPurchaseSection("taxes")}
              className="order-5"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-medium text-zinc-500">
                    Total {formatCurrencyARS(fiscalOtherTotal)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sky text-xs"
                    onClick={addFiscalLineAndOpen}
                  >
                    <PlusIcon className="size-4" />
                    Agregar tributo
                  </button>
                </div>

                {fiscalLines.length ? (
                  <div className="space-y-1 border-t border-zinc-200/70 pt-3">
                    {fiscalLines.map((line, index) => (
                      <div
                        key={`fiscal-line-${index}`}
                        className="grid gap-3 border-t border-zinc-200/70 py-3 first:border-t-0 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_40px] xl:items-start"
                      >
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Tipo</span>
                          <select
                            className="input w-full min-w-0 cursor-pointer text-xs"
                            value={line.type}
                            onChange={(event) =>
                              handleFiscalLineChange(
                                index,
                                "type",
                                event.target.value,
                              )
                            }
                          >
                            {PURCHASE_FISCAL_LINE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Jurisdiccion</span>
                          <div
                            className={`relative ${
                              openJurisdictionIndex === index ? "z-[120]" : "z-0"
                            }`}
                          >
                            <input
                              className="input w-full min-w-0 text-xs"
                              value={line.jurisdiction}
                              onChange={(event) => {
                                handleFiscalLineChange(
                                  index,
                                  "jurisdiction",
                                  event.target.value,
                                );
                                setOpenJurisdictionIndex(index);
                                setJurisdictionActiveIndex(0);
                              }}
                              onFocus={() => {
                                setOpenJurisdictionIndex(index);
                                setJurisdictionActiveIndex(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setOpenJurisdictionIndex((current) =>
                                    current === index ? null : current,
                                  );
                                  handleFiscalLineChange(
                                    index,
                                    "jurisdiction",
                                    normalizeJurisdiction(
                                      fiscalLines[index]?.jurisdiction ?? "",
                                    ),
                                  );
                                }, 120);
                              }}
                              onKeyDown={(event) =>
                                handleFiscalJurisdictionKeyDown(
                                  event,
                                  index,
                                  getJurisdictionMatches(line.jurisdiction),
                                )
                              }
                              placeholder="Ej: Buenos Aires"
                              autoComplete="off"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-haspopup="listbox"
                              aria-expanded={openJurisdictionIndex === index}
                              aria-controls={`purchase-jurisdiction-options-${index}`}
                              aria-activedescendant={
                                openJurisdictionIndex === index &&
                                getJurisdictionMatches(line.jurisdiction)[
                                  jurisdictionActiveIndex
                                ]
                                  ? `purchase-jurisdiction-option-${index}-${normalizeQuery(
                                      getJurisdictionMatches(line.jurisdiction)[
                                        jurisdictionActiveIndex
                                      ] ?? "",
                                    )}`
                                  : undefined
                              }
                            />
                            <AnimatePresence>
                              {openJurisdictionIndex === index ? (
                                <motion.div
                                  key={`purchase-jurisdiction-options-${index}`}
                                  id={`purchase-jurisdiction-options-${index}`}
                                  role="listbox"
                                  aria-label="Jurisdicciones"
                                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                  className="absolute z-[130] mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200/70 bg-white/95 p-2 shadow-[0_14px_24px_-18px_rgba(82,82,91,0.45)] backdrop-blur-xl"
                                >
                                  {getJurisdictionMatches(line.jurisdiction).length ? (
                                    getJurisdictionMatches(line.jurisdiction).map(
                                      (jurisdiction, matchIndex) => {
                                        const isActive =
                                          matchIndex === jurisdictionActiveIndex;
                                        const normalizedMatch = normalizeQuery(jurisdiction);
                                        return (
                                          <button
                                            key={`${jurisdiction}-${matchIndex}`}
                                            type="button"
                                            id={`purchase-jurisdiction-option-${index}-${normalizedMatch}`}
                                            role="option"
                                            aria-selected={isActive}
                                            className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs transition ${
                                              isActive
                                                ? "bg-sky-50 text-sky-950"
                                                : "hover:bg-zinc-50 text-zinc-700"
                                            }`}
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              applyFiscalJurisdictionSuggestion(
                                                index,
                                                jurisdiction,
                                              );
                                            }}
                                          >
                                            {jurisdiction}
                                          </button>
                                        );
                                      },
                                    )
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-zinc-500">
                                      Sin coincidencias.
                                    </div>
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Base</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                              $
                            </span>
                            <MoneyInput
                              className="input no-spinner w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              value={line.baseAmount}
                              onValueChange={(value) =>
                                handleFiscalLineChange(index, "baseAmount", value)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">%</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold text-zinc-500">
                              %
                            </span>
                            <input
                              className="input w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              inputMode="decimal"
                              value={line.rate}
                              onChange={(event) =>
                                handleFiscalLineChange(
                                  index,
                                  "rate",
                                  normalizeDecimalInput(event.target.value, 4),
                                )
                              }
                              placeholder="0"
                            />
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Importe</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                              $
                            </span>
                            <MoneyInput
                              className="input no-spinner w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              value={line.amount}
                              onValueChange={(value) =>
                                handleFiscalLineChange(index, "amount", value)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </div>
                          {line.manualAmountOverride ? (
                            <div className="flex items-center justify-end pt-1 text-[10px]">
                              <button
                                type="button"
                                className="text-sky-700 transition hover:text-sky-900"
                                onClick={() => handleFiscalLineChange(index, "amount", "")}
                              >
                                Volver a auto
                              </button>
                            </div>
                          ) : null}
                        </label>
                        <button
                          type="button"
                          className="btn btn-rose h-10 w-10 justify-center self-end p-0 text-xs"
                          onClick={() => removeFiscalLine(index)}
                          aria-label="Quitar tributo"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="border-t border-zinc-200/70 pt-3 text-xs text-zinc-500">
                    Sin percepciones u otros tributos en esta compra.
                  </p>
                )}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Factura"
              summary={invoiceSectionSummary}
              open={openPurchaseSection === "invoice"}
              error={highlightedSection === "invoice"}
              onToggle={() => setOpenPurchaseSection("invoice")}
              className="order-2"
            >
              <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Factura
                </p>
                <MiniToggle
                  checked={hasInvoice}
                  onChange={(next) => {
                    setHasInvoice(next);
                    if (!next) {
                      setInvoiceNumber("");
                      setArcaAuthorizationCode("");
                      setArcaPointOfSale("");
                      setArcaValidationResult(null);
                    }
                  }}
                  label="Tiene factura"
                />
              </div>

              {hasInvoice ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">Tipo</span>
                      <select
                        className={`input w-full min-w-0 cursor-pointer ${getHighlightClass("invoice.voucherKind")}`}
                        value={arcaVoucherKind}
                        onChange={(event) =>
                          setArcaVoucherKind(event.target.value as "A" | "B" | "C")
                        }
                      >
                        <option value="A">Factura A</option>
                        <option value="B">Factura B</option>
                        <option value="C">Factura C</option>
                      </select>
                    </label>
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">Numero comprobante</span>
                      <input
                        className={`input w-full min-w-0 ${getHighlightClass("invoice.invoiceNumber")}`}
                        value={invoiceNumber}
                        onChange={(event) => setInvoiceNumber(event.target.value)}
                        placeholder="0001-00001234"
                      />
                    </label>
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">Punto de venta</span>
                      <input
                        className={`input w-full min-w-0 ${getHighlightClass("invoice.pointOfSale")}`}
                        inputMode="numeric"
                        placeholder="Ej: 1"
                        value={arcaPointOfSale}
                        onChange={(event) =>
                          setArcaPointOfSale(event.target.value.replace(/\D/g, ""))
                        }
                      />
                    </label>
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">CAE</span>
                      <input
                        className={`input w-full min-w-0 ${getHighlightClass("invoice.authorizationCode")}`}
                        value={arcaAuthorizationCode}
                        onChange={(event) =>
                          setArcaAuthorizationCode(event.target.value)
                        }
                        placeholder="Codigo autorizacion"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sky text-xs"
                      onClick={handleValidateArcaOnly}
                      disabled={isArcaValidating}
                    >
                      {isArcaValidating ? "Validando..." : "Validar ARCA"}
                    </button>
                    {arcaValidationResult ? (
                      <span className="pill border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-700">
                        {arcaStatusLabel(arcaValidationResult.status)}
                      </span>
                    ) : null}
                    {arcaValidationResult ? (
                      <span className="text-xs text-zinc-500">
                        {arcaValidationResult.message}
                      </span>
                    ) : null}
                    {arcaValidationResult?.comprobante ? (
                      <span className="text-[11px] text-zinc-500">
                        ARCA devuelve comprobante para correlacion de tipo/punto/numero/fecha/total/CAE.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Pago"
              summary={paymentSectionSummary}
              open={openPurchaseSection === "payment"}
              error={highlightedSection === "payment"}
              onToggle={() => setOpenPurchaseSection("payment")}
              className="order-6"
            >
              <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Pago
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
                {PURCHASE_PAYMENT_MODE_OPTIONS.map((option) => {
                  const isActive = paymentMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setPaymentMode(option.value);
                        if (option.value !== "IMMEDIATE_CASH_OUT") {
                          setCashOutPaymentMethodId("");
                          setCashOutAccountId("");
                        }
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                        isActive
                          ? "border-sky-300 bg-sky-50/70 text-sky-950"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p
                        className={`mt-1 text-[11px] ${
                          isActive ? "text-sky-700" : "text-zinc-500"
                        }`}
                      >
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {registerCashOut ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field-stack">
                    <span className="input-label">Metodo de pago</span>
                    <select
                      className="input cursor-pointer"
                      value={cashOutPaymentMethodId}
                      onChange={(event) =>
                        setCashOutPaymentMethodId(event.target.value)
                      }
                      disabled={!paymentMethods.length}
                    >
                      <option value="">
                        {paymentMethods.length
                          ? "Selecciona metodo"
                          : "Sin metodos activos"}
                      </option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-stack">
                    <span className="input-label">Cuenta de egreso</span>
                    <select
                      className="input cursor-pointer"
                      value={cashOutAccountId}
                      onChange={(event) => setCashOutAccountId(event.target.value)}
                    >
                      <option value="">Selecciona cuenta</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.currencyCode})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              </div>
            </PurchaseSection>

            <button
              type="submit"
              className="btn btn-emerald order-7 w-full"
              disabled={isSubmitting}
            >
              <CheckIcon className="size-4" />
              {isSubmitting ? "Guardando..." : "Revisar compra"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="card space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Reporte mensual para contador
                </h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[auto_auto_auto_auto] sm:items-end">
                <label className="field-stack min-w-0">
                  <span className="input-label">Desde</span>
                  <input
                    type="date"
                    className="input w-full cursor-pointer text-xs"
                    value={reportFrom}
                    onChange={(event) => setReportFrom(event.target.value)}
                  />
                </label>
                <label className="field-stack min-w-0">
                  <span className="input-label">Hasta</span>
                  <input
                    type="date"
                    className="input w-full cursor-pointer text-xs"
                    value={reportTo}
                    onChange={(event) => setReportTo(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn w-full text-xs sm:w-auto"
                  onClick={() => handleDownloadPurchasesReport("csv")}
                >
                  Descargar CSV
                </button>
                <button
                  type="button"
                  className="btn btn-sky w-full text-xs sm:w-auto"
                  onClick={() => handleDownloadPurchasesReport("pdf")}
                >
                  Descargar PDF
                </button>
              </div>
            </div>
          </div>

          <SupplierPaymentsPanel
            purchases={purchases}
            paymentMethods={paymentMethods}
            accounts={accounts}
            currencies={currencies}
            latestUsdRate={latestUsdRate}
            canCancelPayments={canCancelSupplierPayments(role)}
            onPaymentCreated={() => loadPurchases().catch(() => undefined)}
          />

          <div className="card space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Compras registradas
              </h2>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] md:w-auto">
                <input
                  className="input w-full"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar proveedor o comprobante"
                />
                <select
                  className="input w-full cursor-pointer text-xs"
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(event.target.value as "newest" | "oldest")
                  }
                >
                  <option value="newest">Mas recientes</option>
                  <option value="oldest">Mas antiguas</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 md:hidden">
              {filteredPurchases.length ? (
                filteredPurchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {purchase.supplierName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {purchase.invoiceNumber ?? "Sin comprobante"} -{" "}
                          {new Date(
                            purchase.invoiceDate ?? purchase.createdAt,
                          ).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                        {formatCurrencyARS(purchase.total)}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
                      <div>
                        <span className="block uppercase tracking-wide">
                          Productos
                        </span>
                        <span className="font-semibold text-zinc-700">
                          {purchase.itemsCount}
                        </span>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide">
                          IVA
                        </span>
                        <span className="font-semibold text-zinc-700">
                          {formatCurrencyARS(purchase.taxes ?? 0)}
                        </span>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide">
                          Perc./otros
                        </span>
                        <span className="font-semibold text-zinc-700">
                          {formatCurrencyARS(purchase.otherTaxesTotal ?? 0)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`pill border px-2 py-1 text-[10px] font-semibold uppercase ${
                            purchase.impactsAccount
                              ? "border-emerald-200 bg-white text-emerald-800"
                              : "border-zinc-200 bg-white text-zinc-600"
                          }`}
                        >
                          {purchase.impactsAccount ? "Cta. cte." : "Sin impacto"}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          ARCA{" "}
                          {purchase.hasInvoice
                            ? arcaStatusLabel(purchase.arcaValidationStatus)
                            : "-"}
                        </span>
                      </div>
                      {purchase.hasInvoice ? (
                        <button
                          type="button"
                          className="btn text-[11px]"
                          onClick={() => handleRevalidatePurchase(purchase.id)}
                          disabled={revalidatingPurchaseId === purchase.id}
                        >
                          {revalidatingPurchaseId === purchase.id
                            ? "Revalidando..."
                            : "Revalidar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">Sin compras por ahora.</p>
              )}
            </div>
            <div className="hidden md:block">
              <div className="table-scroll">
              <table className="w-full min-w-[1240px] text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Comprobante</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3 text-right">Productos</th>
                    <th className="py-2 pr-3 text-right">IVA compra</th>
                    <th className="py-2 pr-3 text-right">Perc./otros</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3">Impacta cta. cte.</th>
                    <th className="py-2 pr-3">ARCA</th>
                    <th className="py-2 pr-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.length ? (
                    filteredPurchases.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                      >
                        <td className="py-3 pr-3 text-zinc-700">
                          {purchase.invoiceNumber ?? "Sin comprobante"}
                        </td>
                        <td className="py-3 pr-3 text-zinc-900">
                          {purchase.supplierName}
                        </td>
                        <td className="py-3 pr-3 text-zinc-600">
                          {new Date(
                            purchase.invoiceDate ?? purchase.createdAt,
                          ).toLocaleDateString("es-AR")}
                        </td>
                        <td className="py-3 pr-3 text-right text-zinc-700">
                          {purchase.itemsCount}
                        </td>
                        <td className="py-3 pr-3 text-right text-zinc-700">
                          {formatCurrencyARS(purchase.taxes ?? 0)}
                        </td>
                        <td className="py-3 pr-3 text-right text-zinc-700">
                          {formatCurrencyARS(purchase.otherTaxesTotal ?? 0)}
                        </td>
                        <td className="py-3 pr-3 text-right text-zinc-900">
                          {formatCurrencyARS(purchase.total)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`pill border px-2 py-1 text-[10px] font-semibold uppercase ${
                              purchase.impactsAccount
                                ? "border-emerald-200 bg-white text-emerald-800"
                                : "border-zinc-200 bg-white text-zinc-600"
                            }`}
                          >
                            {purchase.impactsAccount ? "Si" : "No"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-zinc-700">
                          {purchase.hasInvoice
                            ? arcaStatusLabel(purchase.arcaValidationStatus)
                            : "-"}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          {purchase.hasInvoice ? (
                            <button
                              type="button"
                              className="btn text-[11px]"
                              onClick={() => handleRevalidatePurchase(purchase.id)}
                              disabled={revalidatingPurchaseId === purchase.id}
                            >
                              {revalidatingPurchaseId === purchase.id
                                ? "Revalidando..."
                                : "Revalidar"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-4 text-sm text-zinc-500" colSpan={10}>
                        Sin compras por ahora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {pendingPurchase ? (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/25 px-4 py-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-purchase-title"
              className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="confirm-purchase-title"
                    className="text-lg font-semibold text-zinc-900"
                  >
                    Confirmar compra
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Revisa los datos principales antes de registrar.
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {formatCurrencyARS(pendingPurchase.total)}
                </span>
              </div>

              <div className="mt-4 divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/70">
                {confirmationRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {row.label}
                    </span>
                    <span className="min-w-0 break-words text-zinc-900">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {status ? (
                <p className="mt-3 text-xs text-rose-600">{status}</p>
              ) : null}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn w-full sm:w-auto"
                  onClick={() => setPendingPurchase(null)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-emerald w-full sm:w-auto"
                  onClick={handleConfirmPurchase}
                  disabled={isSubmitting}
                >
                  <CheckIcon className="size-4" />
                  {isSubmitting ? "Confirmando..." : "Confirmar compra"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {status && !pendingPurchase ? (
        <p className="text-xs text-zinc-500">{status}</p>
      ) : null}
      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
