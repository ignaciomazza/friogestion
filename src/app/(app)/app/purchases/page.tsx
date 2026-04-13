"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
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

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
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
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [supplierActiveIndex, setSupplierActiveIndex] = useState(0);

  const [hasInvoice, setHasInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [totalAmount, setTotalAmount] = useState("");
  const [purchaseVatAmount, setPurchaseVatAmount] = useState("");
  const [impactCurrentAccount, setImpactCurrentAccount] = useState(false);

  const [adjustStock, setAdjustStock] = useState(false);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustmentForm[]>([
    emptyStockAdjustment(),
  ]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);

  const [registerCashOut, setRegisterCashOut] = useState(false);
  const [cashOutAccountId, setCashOutAccountId] = useState("");

  const [validateWithArca, setValidateWithArca] = useState(false);
  const [arcaVoucherKind, setArcaVoucherKind] = useState<"A" | "B" | "C">(
    "B",
  );
  const [arcaAuthorizationCode, setArcaAuthorizationCode] = useState("");
  const [showArcaAdvanced, setShowArcaAdvanced] = useState(false);
  const [arcaAdvanced, setArcaAdvanced] = useState({
    issuerTaxId: "",
    pointOfSale: "",
    voucherType: "",
    voucherNumber: "",
    receiverDocType: "",
    receiverDocNumber: "",
  });
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

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const supplierMatches = useMemo(() => {
    const normalized = normalizeQuery(supplierSearch);
    const list = normalized
      ? suppliers.filter((supplier) =>
          `${supplier.displayName} ${supplier.taxId ?? ""}`
            .toLowerCase()
            .includes(normalized),
        )
      : suppliers;
    return list.slice(0, 8);
  }, [supplierSearch, suppliers]);

  const getProductMatches = (value: string) => {
    const normalized = normalizeQuery(value);
    const list = normalized
      ? products.filter((product) =>
          `${product.name} ${product.sku ?? ""} ${product.brand ?? ""} ${
            product.model ?? ""
          }`
            .toLowerCase()
            .includes(normalized),
        )
      : products;
    return list.slice(0, 8);
  };

  const arcaEnabled = hasInvoice;

  const loadSuppliers = async () => {
    const res = await fetch("/api/suppliers", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as SupplierOption[];
      setSuppliers(data);
    }
  };

  const loadProducts = async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ProductOption[];
      setProducts(data);
    }
  };

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
    loadSuppliers().catch(() => undefined);
    loadProducts().catch(() => undefined);
    loadPurchases().catch(() => undefined);
    loadFinance().catch(() => undefined);
  }, []);

  const handleSupplierSearchChange = (value: string) => {
    setSupplierSearch(value);
    setSupplierId("");
    setIsSupplierOpen(true);
    setSupplierActiveIndex(0);
  };

  const handleSupplierSelect = (supplier: SupplierOption) => {
    setSupplierId(supplier.id);
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

    if (arcaAdvanced.issuerTaxId.trim()) {
      payload.issuerTaxId = arcaAdvanced.issuerTaxId.trim();
    }
    if (arcaAdvanced.pointOfSale.trim()) {
      payload.pointOfSale = Number(arcaAdvanced.pointOfSale);
    }
    if (arcaAdvanced.voucherType.trim()) {
      payload.voucherType = Number(arcaAdvanced.voucherType);
    }
    if (arcaAdvanced.voucherNumber.trim()) {
      payload.voucherNumber = arcaAdvanced.voucherNumber.trim();
    }
    if (arcaAdvanced.receiverDocType.trim()) {
      payload.receiverDocType = arcaAdvanced.receiverDocType.trim();
    }
    if (arcaAdvanced.receiverDocNumber.trim()) {
      payload.receiverDocNumber = arcaAdvanced.receiverDocNumber.trim();
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

    if (registerCashOut && !cashOutAccountId) {
      setStatus("Selecciona una cuenta para registrar el egreso");
      return;
    }

    const arcaPayload = arcaEnabled ? buildArcaPayload() : null;
    if (arcaEnabled && validateWithArca && !arcaPayload) {
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
          cashOutAccountId: registerCashOut ? cashOutAccountId : undefined,
          validateWithArca: arcaEnabled && validateWithArca,
          arcaValidation:
            arcaEnabled && validateWithArca && arcaPayload
              ? { ...arcaPayload }
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo guardar");
        return;
      }

      setSupplierSearch("");
      setSupplierId("");
      setHasInvoice(false);
      setInvoiceNumber("");
      setTotalAmount("");
      setPurchaseVatAmount("");
      setImpactCurrentAccount(false);
      setAdjustStock(false);
      setStockAdjustments([emptyStockAdjustment()]);
      setRegisterCashOut(false);
      setCashOutAccountId("");
      setValidateWithArca(false);
      setArcaVoucherKind("B");
      setArcaAuthorizationCode("");
      setArcaAdvanced({
        issuerTaxId: "",
        pointOfSale: "",
        voucherType: "",
        voucherNumber: "",
        receiverDocType: "",
        receiverDocNumber: "",
      });
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
                        {suppliers.length ? (
                          supplierMatches.length ? (
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
                          ) : (
                            <div className="px-3 py-2 text-xs text-zinc-500">
                              Sin resultados.
                            </div>
                          )
                        ) : (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            No hay proveedores cargados.
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </label>

              <label className="field-stack">
                <span className="input-label">Fecha</span>
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
                <input
                  className="input text-right"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(event) =>
                    setTotalAmount(normalizeDecimalInput(event.target.value, 2))
                  }
                  placeholder="0,00"
                  required
                />
              </label>
              <label className="field-stack">
                <span className="input-label">IVA compra (opc.)</span>
                <input
                  className="input text-right"
                  inputMode="decimal"
                  value={purchaseVatAmount}
                  onChange={(event) =>
                    setPurchaseVatAmount(
                      normalizeDecimalInput(event.target.value, 2),
                    )
                  }
                  placeholder="0,00"
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-2xl border border-zinc-200/70 bg-white/45 p-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniToggle
                checked={hasInvoice}
                onChange={(next) => {
                  setHasInvoice(next);
                  if (!next) {
                    setInvoiceNumber("");
                    setArcaAuthorizationCode("");
                    setValidateWithArca(false);
                    setShowArcaAdvanced(false);
                    setArcaValidationResult(null);
                  }
                }}
                label="Tiene factura"
              />
              <MiniToggle
                checked={impactCurrentAccount}
                onChange={setImpactCurrentAccount}
                label="Impacta cuenta corriente"
              />
              {STOCK_ENABLED ? (
                <MiniToggle
                  checked={adjustStock}
                  onChange={setAdjustStock}
                  label="Ajustar stock"
                />
              ) : null}
              <MiniToggle
                checked={registerCashOut}
                onChange={setRegisterCashOut}
                label="Registrar egreso ahora"
              />
            </div>

            {registerCashOut ? (
              <label className="field-stack max-w-md">
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
            ) : null}

            {hasInvoice ? (
              <div className="space-y-4 rounded-2xl border border-zinc-200/70 bg-white/40 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="field-stack">
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
                  <label className="field-stack">
                    <span className="input-label">Numero comprobante</span>
                    <input
                      className="input"
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                      placeholder="0001-00001234"
                    />
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
                  <label className="field-stack">
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

                <MiniToggle
                  checked={validateWithArca}
                  onChange={setValidateWithArca}
                  disabled={!arcaEnabled}
                  label="Validar con ARCA al guardar"
                />

                <p className="text-[11px] text-zinc-500">
                  CUIT emisor/receptor y punto de venta se derivan desde proveedor
                  y configuracion fiscal. Avanzado solo para override tecnico.
                </p>

                <button
                  type="button"
                  className="btn text-xs"
                  onClick={() => setShowArcaAdvanced((prev) => !prev)}
                >
                  {showArcaAdvanced ? "Ocultar avanzado" : "Mostrar avanzado"}
                </button>

                {showArcaAdvanced ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="field-stack">
                      <span className="input-label">CUIT emisor (override)</span>
                      <input
                        className="input"
                        value={arcaAdvanced.issuerTaxId}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            issuerTaxId: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Punto de venta</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={arcaAdvanced.pointOfSale}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            pointOfSale: event.target.value.replace(/\D/g, ""),
                          }))
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Tipo num.</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={arcaAdvanced.voucherType}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            voucherType: event.target.value.replace(/\D/g, ""),
                          }))
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Numero num.</span>
                      <input
                        className="input"
                        value={arcaAdvanced.voucherNumber}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            voucherNumber: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Doc receptor tipo</span>
                      <input
                        className="input"
                        value={arcaAdvanced.receiverDocType}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            receiverDocType: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field-stack sm:col-span-2 lg:col-span-3">
                      <span className="input-label">Doc receptor numero</span>
                      <input
                        className="input"
                        value={arcaAdvanced.receiverDocNumber}
                        onChange={(event) =>
                          setArcaAdvanced((prev) => ({
                            ...prev,
                            receiverDocNumber: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sky text-xs"
                    onClick={handleValidateArcaOnly}
                    disabled={isArcaValidating}
                  >
                    {isArcaValidating ? "Validando..." : "Validar ahora"}
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
              </div>
            ) : null}

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
                            placeholder="Buscar producto por nombre o codigo"
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
                                {products.length ? (
                                  matches.length ? (
                                    matches.map((product, matchIndex) => {
                                      const isSelected = product.id === item.productId;
                                      const isActive =
                                        matchIndex === productActiveIndex;
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
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-zinc-500">
                                      Sin resultados.
                                    </div>
                                  )
                                ) : (
                                  <div className="px-3 py-2 text-xs text-zinc-500">
                                    No hay productos.
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
            suppliers={suppliers}
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
