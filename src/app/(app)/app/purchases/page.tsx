"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cog6ToothIcon } from "@/components/icons";
import { InlineProductForm } from "./components/InlineProductForm";
import { InlineSupplierForm } from "./components/InlineSupplierForm";
import { NewPurchaseForm } from "./components/NewPurchaseForm";
import { PurchaseStats } from "./components/PurchaseStats";
import { PurchasesRecentTable } from "./components/PurchasesRecentTable";
import { SupplierPaymentsPanel } from "./components/SupplierPaymentsPanel";
import {
  EMPTY_ITEM,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_OPTIONS,
} from "./constants";
import type {
  ProductOption,
  PurchaseItemForm,
  PurchaseRow,
  SupplierOption,
} from "./types";
import {
  formatProductLabel,
  formatSupplierLabel,
  normalizeQuery,
} from "./utils";
import { canCancelSupplierPayments } from "@/lib/auth/rbac";

const parseDateInput = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

type SupplierFormState = {
  displayName: string;
  taxId: string;
  email: string;
  phone: string;
};

type ProductFormState = {
  name: string;
  sku: string;
  brand: string;
  model: string;
  unit: string;
};

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

type PurchaseArcaValidationForm = {
  mode: string;
  issuerTaxId: string;
  pointOfSale: string;
  voucherType: string;
  voucherNumber: string;
  voucherDate: string;
  totalAmount: string;
  authorizationCode: string;
  receiverDocType: string;
  receiverDocNumber: string;
};

export default function PurchasesPage() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [supplierActiveIndex, setSupplierActiveIndex] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [items, setItems] = useState<PurchaseItemForm[]>([{ ...EMPTY_ITEM }]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseQuery, setPurchaseQuery] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [quickRange, setQuickRange] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>(
    []
  );
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [latestUsdRate, setLatestUsdRate] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [supplierForm, setSupplierForm] = useState<SupplierFormState>({
    displayName: "",
    taxId: "",
    email: "",
    phone: "",
  });
  const [supplierStatus, setSupplierStatus] = useState<string | null>(null);
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  const [productForm, setProductForm] = useState<ProductFormState>({
    name: "",
    sku: "",
    brand: "",
    model: "",
    unit: "",
  });
  const [productStatus, setProductStatus] = useState<string | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [purchaseView, setPurchaseView] = useState<"list" | "new">("new");
  const [validateWithArca, setValidateWithArca] = useState(false);
  const [isArcaValidating, setIsArcaValidating] = useState(false);
  const [revalidatingPurchaseId, setRevalidatingPurchaseId] = useState<
    string | null
  >(null);
  const [arcaValidationResult, setArcaValidationResult] = useState<{
    status: string;
    message: string;
    checkedAt: string;
  } | null>(null);
  const [arcaValidationForm, setArcaValidationForm] =
    useState<PurchaseArcaValidationForm>({
      mode: "CAE",
      issuerTaxId: "",
      pointOfSale: "1",
      voucherType: "1",
      voucherNumber: "",
      voucherDate: "",
      totalAmount: "",
      authorizationCode: "",
      receiverDocType: "",
      receiverDocNumber: "",
    });

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const loadProducts = async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ProductOption[];
      setProducts(data);
    }
  };

  const loadSuppliers = async () => {
    const res = await fetch("/api/suppliers", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as SupplierOption[];
      setSuppliers(data);
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
    const [methodsRes, accountsRes, currenciesRes, ratesRes, meRes] = await Promise.all(
      [
        fetch("/api/payment-methods", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/currencies", { cache: "no-store" }),
        fetch("/api/config/exchange-rate", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]
    );

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
        (rate) => rate.baseCode === "USD" && rate.quoteCode === "ARS"
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
    loadProducts().catch(() => undefined);
    loadSuppliers().catch(() => undefined);
    loadPurchases().catch(() => undefined);
    loadFinance().catch(() => undefined);
  }, []);

  const handleItemChange = (
    index: number,
    field: keyof PurchaseItemForm,
    value: string
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === "productSearch") {
        updated.productId = "";
      }
      next[index] = updated;
      return next;
    });
  };

  const handleSupplierSearchChange = (value: string) => {
    setSupplierSearch(value);
    if (supplierId) {
      setSupplierId("");
    }
    setIsSupplierOpen(true);
    setSupplierActiveIndex(0);
  };

  const handleSupplierFocus = () => {
    setIsSupplierOpen(true);
    setSupplierActiveIndex(0);
  };

  const handleSupplierBlur = () => {
    window.setTimeout(() => setIsSupplierOpen(false), 120);
  };

  const handleSupplierFormChange = (
    field: keyof SupplierFormState,
    value: string
  ) => {
    setSupplierForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProductFormChange = (
    field: keyof ProductFormState,
    value: string
  ) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectSupplier = (supplier: SupplierOption) => {
    setSupplierId(supplier.id);
    setSupplierSearch(formatSupplierLabel(supplier));
    setIsSupplierOpen(false);
    setSupplierActiveIndex(0);
    if (supplier.taxId) {
      setArcaValidationForm((prev) => ({
        ...prev,
        issuerTaxId: onlyDigits(supplier.taxId ?? ""),
      }));
    }
  };

  const handleSelectProduct = (index: number, product: ProductOption) => {
    setItems((prev) => {
      const next = [...prev];
      const updated = {
        ...next[index],
        productId: product.id,
        productSearch: formatProductLabel(product),
      };
      if (!updated.unitCost && product.cost) {
        updated.unitCost = product.cost;
      }
      if (!updated.unitPrice && product.price) {
        updated.unitPrice = product.price;
      }
      next[index] = updated;
      return next;
    });
    setOpenProductIndex(null);
    setProductActiveIndex(0);
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setOpenProductIndex((current) => {
      if (current === null) return current;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };

  const subtotal = items.reduce((total, item) => {
    if (!item.qty || !item.unitCost) return total;
    const qty = Number(item.qty);
    const unitCost = Number(item.unitCost);
    if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return total;
    return total + qty * unitCost;
  }, 0);

  useEffect(() => {
    setArcaValidationForm((prev) => ({
      ...prev,
      voucherDate: invoiceDate || prev.voucherDate,
      voucherNumber:
        onlyDigits(invoiceNumber).length > 0
          ? onlyDigits(invoiceNumber)
          : prev.voucherNumber,
      totalAmount: subtotal > 0 ? subtotal.toFixed(2) : prev.totalAmount,
    }));
  }, [invoiceDate, invoiceNumber, subtotal]);

  const totalPurchases = purchases.length;
  const totalItems = purchases.reduce(
    (total, purchase) => total + purchase.itemsCount,
    0
  );
  const totalSpent = purchases.reduce((total, purchase) => {
    if (!purchase.total) return total;
    const value = Number(purchase.total);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
  const uniqueSuppliers = new Set(
    purchases.map((purchase) => purchase.supplierName)
  ).size;

  const filteredPurchases = useMemo(() => {
    const query = normalizeQuery(purchaseQuery);
    const from = parseDateInput(dateFrom);
    const to = dateTo ? endOfDay(parseDateInput(dateTo) ?? new Date()) : null;

    const filtered = purchases.filter((purchase) => {
      if (
        purchaseStatusFilter !== "ALL" &&
        purchase.status !== purchaseStatusFilter
      ) {
        return false;
      }
      if (query) {
        const haystack = normalizeQuery(
          `${purchase.supplierName} ${purchase.invoiceNumber ?? ""}`
        );
        if (!haystack.includes(query)) return false;
      }
      const occurredAt = new Date(
        purchase.invoiceDate ?? purchase.createdAt ?? new Date()
      );
      if (from && occurredAt < from) return false;
      if (to && occurredAt > to) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const aDate = new Date(
        a.invoiceDate ?? a.createdAt ?? new Date()
      ).getTime();
      const bDate = new Date(
        b.invoiceDate ?? b.createdAt ?? new Date()
      ).getTime();
      return sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
    });

    return filtered;
  }, [dateFrom, dateTo, purchaseQuery, purchaseStatusFilter, purchases, sortOrder]);

  const applyQuickRange = (
    range: "month" | "quarter" | "semester" | "year" | "last30"
  ) => {
    if (quickRange === range) {
      setQuickRange(null);
      setDateFrom("");
      setDateTo("");
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let start = new Date(now);
    let end = new Date(now);

    if (range === "month") {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
    }

    if (range === "quarter") {
      const quarterStart = Math.floor(month / 3) * 3;
      start = new Date(year, quarterStart, 1);
      end = new Date(year, quarterStart + 3, 0);
    }

    if (range === "semester") {
      const semesterStart = month < 6 ? 0 : 6;
      start = new Date(year, semesterStart, 1);
      end = new Date(year, semesterStart + 6, 0);
    }

    if (range === "year") {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    }

    if (range === "last30") {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      end = new Date(now);
    }

    setQuickRange(range);
    setDateFrom(formatDateInput(start));
    setDateTo(formatDateInput(end));
  };

  const supplierMatches = (() => {
    const query = normalizeQuery(supplierSearch);
    const list = query
      ? suppliers.filter((supplier) =>
          `${supplier.displayName} ${supplier.taxId ?? ""}`
            .toLowerCase()
            .includes(query)
        )
      : suppliers;
    return list.slice(0, 8);
  })();

  const getProductMatches = (query: string) => {
    const normalized = normalizeQuery(query);
    const list = normalized
      ? products.filter((product) =>
          `${product.name} ${product.sku ?? ""} ${product.brand ?? ""} ${
            product.model ?? ""
          }`
            .toLowerCase()
            .includes(normalized)
        )
      : products;
    return list.slice(0, 8);
  };

  const handleSupplierKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (!supplierMatches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isSupplierOpen) {
        setIsSupplierOpen(true);
        setSupplierActiveIndex(0);
        return;
      }
      setSupplierActiveIndex((prev) =>
        Math.min(prev + 1, supplierMatches.length - 1)
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
        handleSelectSupplier(candidate);
      }
    }
    if (event.key === "Escape") {
      setIsSupplierOpen(false);
    }
  };

  const handleProductKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: ProductOption[]
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
        handleSelectProduct(index, candidate);
      }
    }
    if (event.key === "Escape") {
      setOpenProductIndex(null);
    }
  };

  const handleArcaValidationField = (
    field: keyof PurchaseArcaValidationForm,
    value: string
  ) => {
    setArcaValidationForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildArcaPayload = () => {
    const issuerTaxId = onlyDigits(arcaValidationForm.issuerTaxId);
    const receiverDocNumber = onlyDigits(arcaValidationForm.receiverDocNumber);
    const payload: Record<string, string | number> = {
      mode: arcaValidationForm.mode || "CAE",
      issuerTaxId,
      pointOfSale: Number(arcaValidationForm.pointOfSale || 0),
      voucherType: Number(arcaValidationForm.voucherType || 0),
      voucherNumber: Number(arcaValidationForm.voucherNumber || 0),
      voucherDate: arcaValidationForm.voucherDate,
      totalAmount: Number(arcaValidationForm.totalAmount || 0),
      authorizationCode: arcaValidationForm.authorizationCode.trim(),
    };

    if (
      !issuerTaxId ||
      !payload.pointOfSale ||
      !payload.voucherType ||
      !payload.voucherNumber ||
      !payload.voucherDate ||
      !payload.totalAmount ||
      !payload.authorizationCode
    ) {
      return null;
    }

    if (arcaValidationForm.receiverDocType.trim()) {
      payload.receiverDocType = arcaValidationForm.receiverDocType.trim();
    }
    if (receiverDocNumber) {
      payload.receiverDocNumber = receiverDocNumber;
    }

    return payload;
  };

  const handleValidateArcaOnly = async () => {
    const payload = buildArcaPayload();
    if (!payload) {
      setStatus("Completa datos fiscales para validar con ARCA.");
      return;
    }
    setStatus(null);
    setIsArcaValidating(true);
    try {
      const res = await fetch("/api/purchases/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setStatus(`Compra revalidada (${data.status})`);
      await loadPurchases();
    } catch {
      setStatus("No se pudo revalidar");
    } finally {
      setRevalidatingPurchaseId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      setIsSubmitting(false);
      return;
    }
    if (items.some((item) => !item.productId)) {
      setStatus("Selecciona un producto en cada item");
      setIsSubmitting(false);
      return;
    }
    try {
      const arcaPayload = validateWithArca ? buildArcaPayload() : null;
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          invoiceNumber: invoiceNumber || undefined,
          invoiceDate: invoiceDate || undefined,
          validateWithArca,
          arcaValidation: arcaPayload ?? undefined,
          items: items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice || undefined,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo guardar");
        return;
      }

      setSupplierId("");
      setSupplierSearch("");
      setInvoiceNumber("");
      setInvoiceDate("");
      setItems([{ ...EMPTY_ITEM }]);
      const created = (await res.json()) as PurchaseRow;
      if (created.arcaValidationStatus) {
        setArcaValidationResult({
          status: created.arcaValidationStatus,
          message: created.arcaValidationMessage ?? "Validacion registrada.",
          checkedAt:
            created.arcaValidationCheckedAt ?? new Date().toISOString(),
        });
      } else {
        setArcaValidationResult(null);
      }
      setStatus("Compra registrada");
      await Promise.all([loadPurchases(), loadProducts()]);
    } catch {
      setStatus("No se pudo guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupplierStatus(null);
    setIsCreatingSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: supplierForm.displayName,
          taxId: supplierForm.taxId || undefined,
          email: supplierForm.email || undefined,
          phone: supplierForm.phone || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSupplierStatus(data?.error ?? "No se pudo crear");
        return;
      }

      const supplier = (await res.json()) as SupplierOption;
      setSuppliers((prev) => [supplier, ...prev]);
      setSupplierId(supplier.id);
      setSupplierSearch(formatSupplierLabel(supplier));
      if (supplier.taxId) {
        setArcaValidationForm((prev) => ({
          ...prev,
          issuerTaxId: onlyDigits(supplier.taxId ?? ""),
        }));
      }
      setSupplierForm({
        displayName: "",
        taxId: "",
        email: "",
        phone: "",
      });
      setSupplierStatus("Proveedor creado");
    } catch {
      setSupplierStatus("No se pudo crear");
    } finally {
      setIsCreatingSupplier(false);
    }
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProductStatus(null);
    setIsCreatingProduct(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          sku: productForm.sku || undefined,
          brand: productForm.brand || undefined,
          model: productForm.model || undefined,
          unit: productForm.unit || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setProductStatus(data?.error ?? "No se pudo crear");
        return;
      }

      const product = (await res.json()) as ProductOption;
      setProducts((prev) => [product, ...prev]);
      setItems((prev) => {
        const index = prev.findIndex((item) => !item.productId);
        if (index === -1) {
          return [
            ...prev,
            {
              ...EMPTY_ITEM,
              productId: product.id,
              productSearch: formatProductLabel(product),
            },
          ];
        }
        const next = [...prev];
        next[index] = {
          ...next[index],
          productId: product.id,
          productSearch: formatProductLabel(product),
        };
        return next;
      });
      setProductForm({
        name: "",
        sku: "",
        brand: "",
        model: "",
        unit: "",
      });
      setProductStatus("Producto creado");
    } catch {
      setProductStatus("No se pudo crear");
    } finally {
      setIsCreatingProduct(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Compras
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Carga de facturas, costos y actualizacion de precios.
        </p>
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
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
              purchaseView === "new" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("new")}
            aria-pressed={purchaseView === "new"}
          >
            Nueva compra
          </button>
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
              purchaseView === "list" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("list")}
            aria-pressed={purchaseView === "list"}
          >
            Compras
          </button>
        </div>
      </div>

      <PurchaseStats
        totalPurchases={totalPurchases}
        totalSpent={totalSpent}
        totalItems={totalItems}
        uniqueSuppliers={uniqueSuppliers}
      />

      {purchaseView === "new" ? (
        <>
          <NewPurchaseForm
            supplierSearch={supplierSearch}
            supplierId={supplierId}
            isSupplierOpen={isSupplierOpen}
            supplierMatches={supplierMatches}
            supplierActiveIndex={supplierActiveIndex}
            hasSuppliers={suppliers.length > 0}
            onSupplierSearchChange={handleSupplierSearchChange}
            onSupplierFocus={handleSupplierFocus}
            onSupplierBlur={handleSupplierBlur}
            onSupplierKeyDown={handleSupplierKeyDown}
            onSupplierSelect={handleSelectSupplier}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            onInvoiceNumberChange={setInvoiceNumber}
            onInvoiceDateChange={setInvoiceDate}
            items={items}
            productMap={productMap}
            hasProducts={products.length > 0}
            openProductIndex={openProductIndex}
            productActiveIndex={productActiveIndex}
            getProductMatches={getProductMatches}
            onItemChange={handleItemChange}
            onOpenProductIndexChange={setOpenProductIndex}
            onProductActiveIndexChange={setProductActiveIndex}
            onProductKeyDown={handleProductKeyDown}
            onSelectProduct={handleSelectProduct}
            onRemoveItem={handleRemoveItem}
            onAddItem={handleAddItem}
            subtotal={subtotal}
            extraSection={
              <details className="group rounded-2xl border border-dashed border-sky-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
                      Validacion ARCA comprobante
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Opcional. No bloquea la carga de compra.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase text-zinc-500 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="space-y-4 border-t border-zinc-200/70 px-4 py-4">
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={validateWithArca}
                      onChange={(event) =>
                        setValidateWithArca(event.target.checked)
                      }
                    />
                    Validar con ARCA al guardar
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="field-stack">
                      <span className="input-label">Modo</span>
                      <input
                        className="input"
                        value={arcaValidationForm.mode}
                        onChange={(event) =>
                          handleArcaValidationField("mode", event.target.value)
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">CUIT emisor</span>
                      <input
                        className="input no-spinner"
                        inputMode="numeric"
                        value={arcaValidationForm.issuerTaxId}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "issuerTaxId",
                            onlyDigits(event.target.value)
                          )
                        }
                        placeholder="30123456789"
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Pto. venta</span>
                      <input
                        className="input no-spinner"
                        inputMode="numeric"
                        value={arcaValidationForm.pointOfSale}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "pointOfSale",
                            onlyDigits(event.target.value)
                          )
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Tipo comprobante</span>
                      <input
                        className="input no-spinner"
                        inputMode="numeric"
                        value={arcaValidationForm.voucherType}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "voucherType",
                            onlyDigits(event.target.value)
                          )
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Numero</span>
                      <input
                        className="input no-spinner"
                        inputMode="numeric"
                        value={arcaValidationForm.voucherNumber}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "voucherNumber",
                            onlyDigits(event.target.value)
                          )
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Fecha</span>
                      <input
                        type="date"
                        className="input cursor-pointer"
                        value={arcaValidationForm.voucherDate}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "voucherDate",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Importe total</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={arcaValidationForm.totalAmount}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "totalAmount",
                            event.target.value
                          )
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Codigo autorizacion</span>
                      <input
                        className="input"
                        value={arcaValidationForm.authorizationCode}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "authorizationCode",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Doc receptor (opc.)</span>
                      <input
                        className="input"
                        value={arcaValidationForm.receiverDocType}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "receiverDocType",
                            event.target.value
                          )
                        }
                        placeholder="80 o CUIT"
                      />
                    </label>
                    <label className="field-stack sm:col-span-2 lg:col-span-3">
                      <span className="input-label">Nro doc receptor (opc.)</span>
                      <input
                        className="input no-spinner"
                        inputMode="numeric"
                        value={arcaValidationForm.receiverDocNumber}
                        onChange={(event) =>
                          handleArcaValidationField(
                            "receiverDocNumber",
                            onlyDigits(event.target.value)
                          )
                        }
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
                      {isArcaValidating ? "Validando..." : "Validar ahora"}
                    </button>
                    {arcaValidationResult ? (
                      <span
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                          arcaValidationResult.status === "AUTHORIZED"
                            ? "bg-white text-emerald-800 border border-emerald-200"
                            : arcaValidationResult.status === "OBSERVED"
                              ? "bg-white text-amber-800 border border-amber-200"
                              : arcaValidationResult.status === "REJECTED"
                                ? "bg-white text-rose-700 border border-rose-200"
                                : "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                        }`}
                      >
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
              </details>
            }
            isSubmitting={isSubmitting}
            status={status}
            onSubmit={handleSubmit}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <InlineSupplierForm
              show={showSupplierForm}
              onToggle={() => setShowSupplierForm((prev) => !prev)}
              form={supplierForm}
              onFormChange={handleSupplierFormChange}
              status={supplierStatus}
              isSubmitting={isCreatingSupplier}
              onSubmit={handleCreateSupplier}
            />
            <InlineProductForm
              show={showProductForm}
              onToggle={() => setShowProductForm((prev) => !prev)}
              form={productForm}
              onFormChange={handleProductFormChange}
              status={productStatus}
              isSubmitting={isCreatingProduct}
              onSubmit={handleCreateProduct}
            />
          </div>
        </>
      ) : null}

      {purchaseView === "list" ? (
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

          <div className="card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="section-title">Filtros de compras</h3>
              <button
                type="button"
                className={`btn btn-sky text-xs gap-1.5 ${
                  showAdvancedFilters ? "ring-1 ring-sky-300/70" : ""
                }`}
                onClick={() => setShowAdvancedFilters((prev) => !prev)}
                aria-pressed={showAdvancedFilters}
              >
                <Cog6ToothIcon className="size-3.5" />
                Avanzados
              </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
              <label className="field-stack">
                <span className="input-label">Buscar</span>
                <input
                  className="input w-full"
                  value={purchaseQuery}
                  onChange={(event) => setPurchaseQuery(event.target.value)}
                  placeholder="Proveedor o factura"
                />
              </label>
              <div className="flex h-full items-end justify-end text-right">
                <div className="flex h-[38px] max-w-full items-center justify-center gap-1.5 overflow-x-auto rounded-full border border-dashed border-sky-200 px-2">
                {PURCHASE_STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`toggle-pill whitespace-nowrap px-2.5 py-1 text-[10px] leading-none ${
                      purchaseStatusFilter === status ? "toggle-pill-active" : ""
                    }`}
                    onClick={() =>
                      setPurchaseStatusFilter((prev) =>
                        prev === status ? "ALL" : status
                      )
                    }
                    aria-pressed={purchaseStatusFilter === status}
                  >
                    {PURCHASE_STATUS_LABELS[status] ?? status}
                  </button>
                ))}
                </div>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {showAdvancedFilters ? (
                <motion.div
                  key="purchases-advanced-filters"
                  initial={{ height: 0, opacity: 0, y: -8 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="reveal-motion"
                >
                  <div className="space-y-3 rounded-2xl border border-dashed border-sky-200 bg-white/30 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="field-stack">
                        <span className="input-label">Desde</span>
                        <input
                          type="date"
                          className="input cursor-pointer text-xs"
                          value={dateFrom}
                          onChange={(event) => {
                            setDateFrom(event.target.value);
                            setQuickRange(null);
                          }}
                        />
                      </label>
                      <label className="field-stack">
                        <span className="input-label">Hasta</span>
                        <input
                          type="date"
                          className="input cursor-pointer text-xs"
                          value={dateTo}
                          onChange={(event) => {
                            setDateTo(event.target.value);
                            setQuickRange(null);
                          }}
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <p className="input-label">Rangos rapidos</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`toggle-pill ${
                            quickRange === "month" ? "toggle-pill-active" : ""
                          }`}
                          onClick={() => applyQuickRange("month")}
                          aria-pressed={quickRange === "month"}
                        >
                          Mes actual
                        </button>
                        <button
                          type="button"
                          className={`toggle-pill ${
                            quickRange === "quarter" ? "toggle-pill-active" : ""
                          }`}
                          onClick={() => applyQuickRange("quarter")}
                          aria-pressed={quickRange === "quarter"}
                        >
                          Trimestre
                        </button>
                        <button
                          type="button"
                          className={`toggle-pill ${
                            quickRange === "semester" ? "toggle-pill-active" : ""
                          }`}
                          onClick={() => applyQuickRange("semester")}
                          aria-pressed={quickRange === "semester"}
                        >
                          Semestre
                        </button>
                        <button
                          type="button"
                          className={`toggle-pill ${
                            quickRange === "year" ? "toggle-pill-active" : ""
                          }`}
                          onClick={() => applyQuickRange("year")}
                          aria-pressed={quickRange === "year"}
                        >
                          Anual
                        </button>
                        <button
                          type="button"
                          className={`toggle-pill ${
                            quickRange === "last30" ? "toggle-pill-active" : ""
                          }`}
                          onClick={() => applyQuickRange("last30")}
                          aria-pressed={quickRange === "last30"}
                        >
                          Ultimos 30 dias
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <PurchasesRecentTable
            purchases={filteredPurchases}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            onRevalidate={handleRevalidatePurchase}
            revalidatingId={revalidatingPurchaseId}
          />
        </>
      ) : null}
    </div>
  );
}
