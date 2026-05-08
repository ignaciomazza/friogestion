"use client";

import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
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

type StockAdjustmentForm = {
  productId: string;
  productSearch: string;
  qty: string;
};

type PurchasePaymentMode =
  | "CURRENT_ACCOUNT"
  | "IMMEDIATE_CASH_OUT"
  | "OFF_BOOK";

const emptyStockAdjustment = (): StockAdjustmentForm => ({
  productId: "",
  productSearch: "",
  qty: "",
});

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
  const [totalAmount, setTotalAmount] = useState("");
  const [purchaseVatAmount, setPurchaseVatAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PurchasePaymentMode>("OFF_BOOK");

  const [adjustStock, setAdjustStock] = useState(false);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustmentForm[]>([
    emptyStockAdjustment(),
  ]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);

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
  } | null>(null);

  const [purchaseView, setPurchaseView] = useState<"new" | "list">("new");
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArcaValidating, setIsArcaValidating] = useState(false);
  const [revalidatingPurchaseId, setRevalidatingPurchaseId] = useState<
    string | null
  >(null);
  const supplierMatchesCacheRef = useRef<Map<string, SupplierOption[]>>(
    new Map(),
  );
  const productMatchesCacheRef = useRef<Map<string, ProductOption[]>>(
    new Map(),
  );

  const productMap = useMemo(
    () => new Map(Object.values(selectedProductsById).map((product) => [product.id, product])),
    [selectedProductsById],
  );

  const getProductMatches = (value: string) => {
    const normalized = normalizeQuery(value);
    return productMatchesByQuery[normalized] ?? [];
  };

  const arcaEnabled = hasInvoice;
  const impactCurrentAccount = paymentMode === "CURRENT_ACCOUNT";
  const registerCashOut = paymentMode === "IMMEDIATE_CASH_OUT";

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
      stockAdjustments[openProductIndex]?.productSearch ?? "",
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
  }, [openProductIndex, stockAdjustments]);

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

  const handleStockItemChange = (
    index: number,
    field: keyof StockAdjustmentForm,
    value: string,
  ) => {
    setStockAdjustments((previous) => {
      const next = [...previous];
      const updated = { ...next[index], [field]: value };
      if (field === "productSearch") {
        updated.productId = "";
      }
      next[index] = updated;
      return next;
    });
  };

  const handleSelectStockProduct = (index: number, product: ProductOption) => {
    setStockAdjustments((previous) => {
      const next = [...previous];
      next[index] = {
        ...next[index],
        productId: product.id,
        productSearch: formatProductLabel(product),
      };
      return next;
    });
    setSelectedProductsById((previous) => ({
      ...previous,
      [product.id]: product,
    }));
    setOpenProductIndex(null);
  };

  const handleStockProductKeyDown = (
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
        handleSelectStockProduct(index, candidate);
      }
    }

    if (event.key === "Escape") {
      setOpenProductIndex(null);
    }
  };

  const addStockAdjustment = () => {
    setStockAdjustments((previous) => [...previous, emptyStockAdjustment()]);
  };

  const removeStockAdjustment = (index: number) => {
    setStockAdjustments((previous) => {
      if (previous.length === 1) return previous;
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const buildArcaPayload = () => {
    if (!hasInvoice) return null;
    const amount = parsePositiveNumber(totalAmount);
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
      return;
    }
    const payload = buildArcaPayload();
    if (!payload) {
      setStatus("Completa los datos del comprobante para validar con ARCA.");
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
        setStatus(data?.error ?? "No se pudo validar con ARCA");
        return;
      }

      setArcaValidationResult({
        status: data.status,
        message: data.message,
        checkedAt: data.checkedAt,
      });
      setStatus(`ARCA: ${data.status}`);
    } catch {
      setStatus("No se pudo validar con ARCA");
    } finally {
      setIsArcaValidating(false);
    }
  };

  const normalizedStockAdjustments = useMemo(() => {
    return stockAdjustments
      .map((item) => ({
        productId: item.productId,
        qty: parseOptionalNumber(item.qty),
      }))
      .filter(
        (item): item is { productId: string; qty: number } =>
          Boolean(item.productId) &&
          item.qty !== null &&
          Number.isFinite(item.qty) &&
          item.qty !== 0,
      );
  }, [stockAdjustments]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    const shouldAdjustStock = STOCK_ENABLED && adjustStock;

    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      return;
    }

    const total = parsePositiveNumber(totalAmount);
    if (!total) {
      setStatus("Ingresa un total valido");
      return;
    }

    const vatAmount = parseOptionalNumber(purchaseVatAmount);
    if (vatAmount !== null && vatAmount < 0) {
      setStatus("IVA compra invalido");
      return;
    }

    if (hasInvoice && !invoiceNumber.trim()) {
      setStatus("Ingresa numero de comprobante");
      return;
    }

    if (shouldAdjustStock && normalizedStockAdjustments.length === 0) {
      setStatus("Agrega items para ajustar stock");
      return;
    }

    if (registerCashOut && !cashOutPaymentMethodId) {
      setStatus("Selecciona un metodo de pago para el egreso");
      return;
    }

    if (registerCashOut && !cashOutAccountId) {
      setStatus("Selecciona una cuenta para registrar el egreso");
      return;
    }

    const arcaPayload = arcaEnabled ? buildArcaPayload() : null;
    if (arcaEnabled && !arcaPayload) {
      setStatus("Completa los datos del comprobante para validar ARCA");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          hasInvoice: arcaEnabled,
          invoiceNumber: arcaEnabled ? invoiceNumber || undefined : undefined,
          invoiceDate: invoiceDate || undefined,
          totalAmount: total,
          purchaseVatAmount: vatAmount ?? undefined,
          impactCurrentAccount,
          adjustStock: shouldAdjustStock,
          stockAdjustments: shouldAdjustStock
            ? normalizedStockAdjustments.map((item) => ({
                productId: item.productId,
                qty: item.qty,
              }))
            : undefined,
          registerCashOut,
          cashOutPaymentMethodId: registerCashOut
            ? cashOutPaymentMethodId
            : undefined,
          cashOutAccountId: registerCashOut ? cashOutAccountId : undefined,
          validateWithArca: arcaEnabled,
          arcaValidation: arcaEnabled && arcaPayload ? { ...arcaPayload } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo guardar");
        return;
      }

      setSupplierSearch("");
      setSupplierId("");
      setSelectedSupplier(null);
      setSelectedSupplierTaxId("");
      setSupplierDataStatus(null);
      setHasInvoice(false);
      setInvoiceNumber("");
      setTotalAmount("");
      setPurchaseVatAmount("");
      setPaymentMode("OFF_BOOK");
      setAdjustStock(false);
      setStockAdjustments([emptyStockAdjustment()]);
      setCashOutPaymentMethodId("");
      setCashOutAccountId("");
      setArcaVoucherKind("B");
      setArcaAuthorizationCode("");
      setArcaPointOfSale("");
      setArcaValidationResult(null);
      setStatus("Compra registrada");
      await loadPurchases();
    } catch {
      setStatus("No se pudo guardar");
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
      setStatus(`Comprobante revalidado (${data.status})`);
      await loadPurchases();
    } catch {
      setStatus("No se pudo revalidar");
    } finally {
      setRevalidatingPurchaseId(null);
    }
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
          ? "ARCA no encontro el CUIT cargado."
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Compras</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Carga compras con o sin factura y registra egresos.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[680px] grid-cols-3 gap-2">
          <div className="card border !border-sky-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-sky-700">Compras</span>
              <p className="text-base font-semibold text-zinc-900">
                {totalPurchases}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-emerald-700">
                Impactan cta. cte.
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {impactCount}
              </p>
            </div>
          </div>
          <div className="card border !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700">
                Total registrado
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {formatCurrencyARS(totalAmountRegistered)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-grid grid-cols-2 rounded-2xl border border-zinc-200/70 bg-white/55 p-1.5">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl border border-sky-200 bg-white shadow-[0_4px_10px_-8px_rgba(14,116,144,0.32)] transition-transform duration-200 ease-out ${
              purchaseView === "list" ? "translate-x-full" : ""
            }`}
          />
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors ${
              purchaseView === "new" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("new")}
            aria-pressed={purchaseView === "new"}
          >
            Nueva compra
          </button>
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors ${
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
        <div className="card space-y-6 p-6 md:p-7">
          <h2 className="text-lg font-semibold text-zinc-900">Nueva compra</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(360px,1.6fr)_minmax(220px,1fr)]">
              <label className="field-stack">
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
                    required
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

              <label className="field-stack">
                <span className="input-label">Fecha comprobante</span>
                <input
                  type="date"
                  className="input cursor-pointer"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field-stack">
                <span className="input-label">Total compra</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                    $
                  </span>
                  <MoneyInput
                    className="input no-spinner w-full pl-10 text-right tabular-nums"
                    value={totalAmount}
                    onValueChange={setTotalAmount}
                    placeholder="0,00"
                    maxDecimals={2}
                    required
                  />
                </div>
              </label>
              <label className="field-stack">
                <span className="input-label">IVA compra (opc.)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                    $
                  </span>
                  <MoneyInput
                    className="input no-spinner w-full pl-10 text-right tabular-nums"
                    value={purchaseVatAmount}
                    onValueChange={setPurchaseVatAmount}
                    placeholder="0,00"
                    maxDecimals={2}
                  />
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div className="space-y-3 rounded-2xl border border-zinc-200/70 bg-white/45 p-3">
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
                    <div className="flex flex-wrap gap-2">
                      <label className="field-stack w-full sm:w-[220px]">
                        <span className="input-label">Tipo</span>
                        <select
                          className="input cursor-pointer"
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
                      <label className="field-stack w-full sm:w-[220px]">
                        <span className="input-label">Numero comprobante</span>
                        <input
                          className="input"
                          value={invoiceNumber}
                          onChange={(event) => setInvoiceNumber(event.target.value)}
                          placeholder="0001-00001234"
                        />
                      </label>
                      <label className="field-stack w-full sm:w-[220px]">
                        <span className="input-label">Punto de venta (opc.)</span>
                        <input
                          className="input"
                          inputMode="numeric"
                          placeholder="Ej: 1"
                          value={arcaPointOfSale}
                          onChange={(event) =>
                            setArcaPointOfSale(event.target.value.replace(/\D/g, ""))
                          }
                        />
                      </label>
                      <label className="field-stack w-full sm:w-[220px]">
                        <span className="input-label">CAE</span>
                        <input
                          className="input"
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
                        {isArcaValidating ? "Validando..." : "Validar ahora en ARCA"}
                      </button>
                      {arcaValidationResult ? (
                        <span className="pill border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-700">
                          {arcaValidationResult.status}
                        </span>
                      ) : null}
                      {arcaValidationResult ? (
                        <span className="text-xs text-zinc-500">
                          {arcaValidationResult.message}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Activa esta opcion para cargar y validar el comprobante.
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-zinc-200/70 bg-white/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Pago
                  </p>
                  {STOCK_ENABLED ? (
                    <MiniToggle
                      checked={adjustStock}
                      onChange={setAdjustStock}
                      label="Ajustar stock"
                    />
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Modalidad de pago
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
                          className={`rounded-2xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                            isActive
                              ? "border-sky-300 bg-sky-50/80 text-sky-950 shadow-[0_8px_20px_-16px_rgba(14,116,144,0.5)]"
                              : "border-zinc-200 bg-white/80 text-zinc-700 hover:border-zinc-300 hover:bg-white"
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
                        required
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
                        required
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
            </div>

            {STOCK_ENABLED && adjustStock ? (
              <div className="space-y-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Ajuste de stock
                  </h3>
                  <button
                    type="button"
                    className="btn text-xs"
                    onClick={addStockAdjustment}
                  >
                    <PlusIcon className="size-4" />
                    Agregar item
                  </button>
                </div>

                <div className="space-y-2">
                  {stockAdjustments.map((item, index) => {
                    const matches = getProductMatches(item.productSearch);
                    const isOpen = openProductIndex === index;
                    const selectedProduct = productMap.get(item.productId);
                    return (
                      <div
                        key={`stock-adjustment-${index}`}
                        className="grid gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 p-3 sm:grid-cols-[1fr_120px_auto]"
                      >
                        <div className="relative">
                          <input
                            className="input"
                            value={item.productSearch}
                            onChange={(event) => {
                              handleStockItemChange(
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
                              handleStockProductKeyDown(event, index, matches)
                            }
                            placeholder="Buscar producto por nombre, codigo interno o codigo compra"
                            autoComplete="off"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-haspopup="listbox"
                            aria-expanded={isOpen}
                            aria-controls={`stock-adjustment-options-${index}`}
                            aria-activedescendant={
                              isOpen && matches[productActiveIndex]
                                ? `stock-adjustment-option-${index}-${
                                    matches[productActiveIndex].id
                                  }`
                                : undefined
                            }
                          />
                          <AnimatePresence>
                            {isOpen ? (
                              <motion.div
                                key={`stock-adjustment-options-${index}`}
                                id={`stock-adjustment-options-${index}`}
                                role="listbox"
                                aria-label="Productos"
                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                transition={{
                                  duration: 0.18,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                              >
                                {matches.length ? (
                                  matches.map((product, matchIndex) => {
                                    const isSelected = product.id === item.productId;
                                    const isActive = matchIndex === productActiveIndex;
                                    return (
                                      <button
                                        key={product.id}
                                        type="button"
                                        id={`stock-adjustment-option-${index}-${product.id}`}
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
                                          handleSelectStockProduct(index, product);
                                        }}
                                      >
                                        <span className="font-medium text-zinc-900">
                                          {formatProductLabel(product)}
                                        </span>
                                        <span className="text-xs text-zinc-500">
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
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Unidad: {formatUnit(selectedProduct?.unit ?? null)}
                          </p>
                        </div>

                        <input
                          className="input text-right"
                          inputMode="decimal"
                          value={item.qty}
                          onChange={(event) =>
                            handleStockItemChange(
                              index,
                              "qty",
                              normalizeDecimalInput(event.target.value, 3),
                            )
                          }
                          placeholder="Cantidad"
                        />

                        <button
                          type="button"
                          className="btn btn-rose text-xs"
                          onClick={() => removeStockAdjustment(index)}
                          disabled={stockAdjustments.length <= 1}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn-emerald w-full"
              disabled={isSubmitting}
            >
              <CheckIcon className="size-4" />
              {isSubmitting ? "Guardando..." : "Registrar compra"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <SupplierPaymentsPanel
            purchases={purchases}
            paymentMethods={paymentMethods}
            accounts={accounts}
            currencies={currencies}
            latestUsdRate={latestUsdRate}
            canCancelPayments={canCancelSupplierPayments(role)}
            onPaymentCreated={() => loadPurchases().catch(() => undefined)}
          />

          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Compras registradas
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input w-56"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar proveedor o comprobante"
                />
                <select
                  className="input cursor-pointer text-xs"
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
            <div className="table-scroll">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Comprobante</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3 text-right">IVA compra</th>
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
                          {formatCurrencyARS(purchase.taxes ?? 0)}
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
                            ? purchase.arcaValidationStatus ?? "PENDING"
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
                      <td className="py-4 text-sm text-zinc-500" colSpan={8}>
                        Sin compras por ahora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
