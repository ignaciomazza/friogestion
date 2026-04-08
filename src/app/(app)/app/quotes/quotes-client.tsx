"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cog6ToothIcon, PlusIcon } from "@/components/icons";
import { CUSTOMER_SYSTEM_KEYS } from "@/lib/customers/system-keys";
import { InlineCustomerForm } from "./components/InlineCustomerForm";
import { NewQuoteForm } from "./components/NewQuoteForm";
import { QuoteRecentTable } from "./components/QuoteRecentTable";
import { QuoteStats } from "./components/QuoteStats";
import { EMPTY_ITEM } from "./constants";
import type {
  CustomerOption,
  ProductOption,
  QuoteItemForm,
  QuoteRow,
} from "./types";
import {
  formatCustomerLabel,
  formatProductLabel,
  normalizeQuery,
} from "./utils";

type QuotesClientProps = {
  initialCustomers: CustomerOption[];
  initialProducts: ProductOption[];
  initialQuotes: QuoteRow[];
};

type CustomerFormState = {
  displayName: string;
  type: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
};

type QuoteDetail = QuoteRow & {
  customer: CustomerOption;
  items: Array<{
    productId: string;
    qty: string;
    unitPrice: string;
    taxRate: string;
    product: ProductOption;
  }>;
};

type DeliveryNoteRow = {
  id: string;
  type: string;
  pointOfSale: number;
  number: number | null;
  status: string;
  issuedAt: string | null;
  deliveredAt: string | null;
  customerName: string | null;
  saleNumber: string | null;
  observations: string | null;
};

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

const normalizeTaxId = (value: string) => value.replace(/\D/g, "");
const CONSUMER_FINAL_IDENTIFICATION_THRESHOLD = 10_000_000;

export default function QuotesClient({
  initialCustomers,
  initialProducts,
  initialQuotes,
}: QuotesClientProps) {
  const [customers, setCustomers] =
    useState<CustomerOption[]>(initialCustomers);
  const [products] = useState<ProductOption[]>(initialProducts);
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);

  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isConsumerFinalAnonymous, setIsConsumerFinalAnonymous] = useState(false);
  const [isResolvingConsumerFinal, setIsResolvingConsumerFinal] = useState(false);
  const [consumerFinalCustomer, setConsumerFinalCustomer] =
    useState<CustomerOption | null>(null);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);

  const [validUntil, setValidUntil] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("DRAFT");
  const [extraType, setExtraType] = useState("NONE");
  const [extraValue, setExtraValue] = useState("");

  const [items, setItems] = useState<QuoteItemForm[]>([{ ...EMPTY_ITEM }]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<"ALL" | "EXPIRED" | "ACTIVE">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [quickRange, setQuickRange] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [customerForm, setCustomerForm] = useState<CustomerFormState>({
    displayName: "",
    type: "CONSUMER_FINAL",
    email: "",
    phone: "",
    taxId: "",
    address: "",
  });
  const [customerStatus, setCustomerStatus] = useState<string | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [quoteView, setQuoteView] = useState<"list" | "new">("new");
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteRow[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [deliveryBusyId, setDeliveryBusyId] = useState<string | null>(null);
  const [isRemitosOpen, setIsRemitosOpen] = useState(false);
  const [deliveryQuoteSearch, setDeliveryQuoteSearch] = useState("");
  const [isDeliveryQuoteOpen, setIsDeliveryQuoteOpen] = useState(false);
  const [deliveryQuoteActiveIndex, setDeliveryQuoteActiveIndex] = useState(0);
  const [deliveryForm, setDeliveryForm] = useState({
    quoteId: "",
    observations: "",
  });

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );
  const selectedCustomer =
    (customerId ? customerById.get(customerId) : null) ??
    (consumerFinalCustomer?.id === customerId ? consumerFinalCustomer : null);
  const isSelectedAnonymousConsumerFinal = Boolean(
    selectedCustomer?.systemKey === CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON
  );

  const loadCustomers = async () => {
    const res = await fetch("/api/customers", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as CustomerOption[];
      setCustomers(data);
    }
  };

  const loadQuotes = async () => {
    const res = await fetch("/api/quotes", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as QuoteRow[];
      setQuotes(data);
    }
  };

  const loadDeliveryNotes = async () => {
    const res = await fetch("/api/remitos", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as DeliveryNoteRow[];
      setDeliveryNotes(data);
    }
  };

  useEffect(() => {
    loadDeliveryNotes().catch(() => undefined);
  }, []);

  const resetForm = () => {
    setCustomerId("");
    setCustomerSearch("");
    setIsConsumerFinalAnonymous(false);
    setIsResolvingConsumerFinal(false);
    setConsumerFinalCustomer(null);
    setValidUntil("");
    setQuoteStatus("DRAFT");
    setExtraType("NONE");
    setExtraValue("");
    setItems([{ ...EMPTY_ITEM }]);
    setEditingId(null);
  };

  const handleItemChange = (
    index: number,
    field: keyof QuoteItemForm,
    value: string,
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

  const handleCustomerSearchChange = (value: string) => {
    if (isConsumerFinalAnonymous) {
      setIsConsumerFinalAnonymous(false);
      setConsumerFinalCustomer(null);
    }
    setCustomerSearch(value);
    if (customerId) {
      setCustomerId("");
    }
    setIsCustomerOpen(true);
    setCustomerActiveIndex(0);
  };

  const handleCustomerFocus = () => {
    setIsCustomerOpen(true);
    setCustomerActiveIndex(0);
  };

  const handleCustomerBlur = () => {
    window.setTimeout(() => setIsCustomerOpen(false), 120);
  };

  const handleSelectCustomer = (customer: CustomerOption) => {
    const isAnonymousConsumerFinal =
      customer.systemKey === CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON;
    setCustomerId(customer.id);
    setCustomerSearch(formatCustomerLabel(customer));
    setIsConsumerFinalAnonymous(isAnonymousConsumerFinal);
    setConsumerFinalCustomer(isAnonymousConsumerFinal ? customer : null);
    setIsCustomerOpen(false);
  };

  const handleConsumerFinalToggle = async (enabled: boolean) => {
    setStatus(null);
    if (!enabled) {
      setIsConsumerFinalAnonymous(false);
      setIsResolvingConsumerFinal(false);
      setConsumerFinalCustomer(null);
      setCustomerId("");
      setCustomerSearch("");
      setIsCustomerOpen(false);
      setCustomerActiveIndex(0);
      return;
    }

    setIsResolvingConsumerFinal(true);
    try {
      const res = await fetch("/api/customers/consumer-final", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo resolver consumidor final");
        setIsConsumerFinalAnonymous(false);
        return;
      }
      const customer = data as CustomerOption;
      setConsumerFinalCustomer(customer);
      setCustomerId(customer.id);
      setCustomerSearch(formatCustomerLabel(customer));
      setIsConsumerFinalAnonymous(true);
      setIsCustomerOpen(false);
      setCustomerActiveIndex(0);
    } catch {
      setStatus("No se pudo resolver consumidor final");
      setIsConsumerFinalAnonymous(false);
    } finally {
      setIsResolvingConsumerFinal(false);
    }
  };

  const handleSelectProduct = (index: number, product: ProductOption) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: product.id,
        productSearch: formatProductLabel(product),
        unitPrice: product.price ?? next[index].unitPrice,
      };
      return next;
    });
    setOpenProductIndex(null);
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
    if (!item.qty || !item.unitPrice) return total;
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return total;
    return total + qty * unitPrice;
  }, 0);

  const taxesTotal = items.reduce((total, item) => {
    if (!item.qty || !item.unitPrice) return total;
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    const rate = Number(item.taxRate);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return total;
    if (!Number.isFinite(rate)) return total;
    return total + qty * unitPrice * (rate / 100);
  }, 0);

  const extraValueNumber = Number(extraValue);
  const safeExtraValue = Number.isFinite(extraValueNumber)
    ? extraValueNumber
    : 0;
  const extraAmount =
    extraType === "PERCENT"
      ? subtotal * (safeExtraValue / 100)
      : extraType === "FIXED"
        ? safeExtraValue
        : 0;

  const total = subtotal + taxesTotal + extraAmount;
  const consumerFinalThresholdReached =
    isSelectedAnonymousConsumerFinal &&
    total >= CONSUMER_FINAL_IDENTIFICATION_THRESHOLD;
  const consumerFinalThresholdLabel =
    CONSUMER_FINAL_IDENTIFICATION_THRESHOLD.toLocaleString("es-AR");

  const totalQuotes = quotes.length;
  const sentQuotes = quotes.filter((quote) => quote.status === "SENT").length;
  const acceptedQuotes = quotes.filter(
    (quote) => quote.status === "ACCEPTED",
  ).length;
  const totalEstimated = quotes.reduce((totalValue, quote) => {
    if (!quote.total) return totalValue;
    const value = Number(quote.total);
    return Number.isFinite(value) ? totalValue + value : totalValue;
  }, 0);

  const filteredQuotes = useMemo(() => {
    const query = normalizeQuery(quoteQuery);
    const from = parseDateInput(dateFrom);
    const to = dateTo ? endOfDay(parseDateInput(dateTo) ?? new Date()) : null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const filtered = quotes.filter((quote) => {
      const validUntilDate = quote.validUntil
        ? parseDateInput(quote.validUntil.slice(0, 10))
        : null;
      const isExpired =
        quote.status === "EXPIRED" ||
        (validUntilDate
          ? endOfDay(validUntilDate).getTime() < todayStart.getTime()
          : false);
      if (expiryFilter === "EXPIRED" && !isExpired) return false;
      if (expiryFilter === "ACTIVE" && isExpired) return false;
      if (query) {
        const haystack = normalizeQuery(
          `${quote.customerName} ${quote.quoteNumber ?? ""}`,
        );
        if (!haystack.includes(query)) return false;
      }
      const createdAt = new Date(quote.createdAt);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
    });

    return filtered;
  }, [dateFrom, dateTo, expiryFilter, quoteQuery, quotes, sortOrder]);

  const customerMatches = (() => {
    const query = normalizeQuery(customerSearch);
    const list = query
      ? customers.filter((customer) =>
          `${customer.displayName} ${customer.taxId ?? ""} ${
            customer.email ?? ""
          }`
            .toLowerCase()
            .includes(query),
        )
      : customers;
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
            .includes(normalized),
        )
      : products;
    return list.slice(0, 8);
  };

  const deliveryQuoteMatches = (() => {
    const query = normalizeQuery(deliveryQuoteSearch);
    const list = query
      ? quotes.filter((quote) =>
          `${quote.quoteNumber ?? ""} ${quote.customerName} ${quote.id}`
            .toLowerCase()
            .includes(query)
        )
      : quotes;
    return list.slice(0, 8);
  })();

  const formatDeliveryQuoteLabel = (quote: QuoteRow) =>
    `${quote.quoteNumber ?? quote.id} · ${quote.customerName}`;

  const handleCustomerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!customerMatches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isCustomerOpen) {
        setIsCustomerOpen(true);
        setCustomerActiveIndex(0);
        return;
      }
      setCustomerActiveIndex((prev) =>
        Math.min(prev + 1, customerMatches.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isCustomerOpen) {
        setIsCustomerOpen(true);
        setCustomerActiveIndex(customerMatches.length - 1);
        return;
      }
      setCustomerActiveIndex((prev) => Math.max(prev - 1, 0));
    }
    if (event.key === "Enter") {
      if (!isCustomerOpen) return;
      event.preventDefault();
      const candidate = customerMatches[customerActiveIndex];
      if (candidate) {
        handleSelectCustomer(candidate);
      }
    }
    if (event.key === "Escape") {
      setIsCustomerOpen(false);
    }
  };

  const handleProductKeyDown = (
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
        handleSelectProduct(index, candidate);
      }
    }
    if (event.key === "Escape") {
      setOpenProductIndex(null);
    }
  };

  const handleDeliveryQuoteSearchChange = (value: string) => {
    setDeliveryQuoteSearch(value);
    setDeliveryForm((prev) => ({
      ...prev,
      quoteId: "",
    }));
    setIsDeliveryQuoteOpen(true);
    setDeliveryQuoteActiveIndex(0);
  };

  const handleDeliveryQuoteSelect = (quote: QuoteRow) => {
    setDeliveryForm((prev) => ({
      ...prev,
      quoteId: quote.id,
    }));
    setDeliveryQuoteSearch(formatDeliveryQuoteLabel(quote));
    setIsDeliveryQuoteOpen(false);
  };

  const handleDeliveryQuoteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!deliveryQuoteMatches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isDeliveryQuoteOpen) {
        setIsDeliveryQuoteOpen(true);
        setDeliveryQuoteActiveIndex(0);
        return;
      }
      setDeliveryQuoteActiveIndex((prev) =>
        Math.min(prev + 1, deliveryQuoteMatches.length - 1)
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isDeliveryQuoteOpen) {
        setIsDeliveryQuoteOpen(true);
        setDeliveryQuoteActiveIndex(deliveryQuoteMatches.length - 1);
        return;
      }
      setDeliveryQuoteActiveIndex((prev) => Math.max(prev - 1, 0));
    }
    if (event.key === "Enter") {
      if (!isDeliveryQuoteOpen) return;
      event.preventDefault();
      const candidate = deliveryQuoteMatches[deliveryQuoteActiveIndex];
      if (candidate) {
        handleDeliveryQuoteSelect(candidate);
      }
    }
    if (event.key === "Escape") {
      setIsDeliveryQuoteOpen(false);
    }
  };

  const confirmConsumerFinalThreshold = () => {
    if (!consumerFinalThresholdReached) return true;
    return window.confirm(
      `Esta operacion de consumidor final es mayor o igual a $${consumerFinalThresholdLabel}. ` +
        "ARCA puede requerir identificar al receptor. Queres continuar?"
    );
  };

  const submitQuote = async (
    mode: "saveQuote" | "saveAndCreateSale"
  ) => {
    setStatus(null);
    if (!customerId) {
      setStatus("Selecciona un cliente");
      return;
    }
    if (items.some((item) => !item.productId)) {
      setStatus("Selecciona un producto en cada item");
      return;
    }
    if (mode === "saveAndCreateSale" && editingId) {
      setStatus("Guardar y crear venta solo aplica para nuevos presupuestos");
      return;
    }
    if (!confirmConsumerFinalThreshold()) {
      setStatus("Operacion cancelada");
      return;
    }

    setIsSubmitting(true);
    const parsedExtraValue = Number(extraValue);
    const safeExtraValue = Number.isFinite(parsedExtraValue)
      ? parsedExtraValue
      : 0;
    try {
      const res = await fetch("/api/quotes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          customerId,
          validUntil: validUntil || undefined,
          status: editingId ? quoteStatus : "DRAFT",
          extraType: extraType === "NONE" ? undefined : extraType,
          extraValue:
            extraType === "NONE" ? undefined : safeExtraValue || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo guardar");
        return;
      }

      if (mode === "saveAndCreateSale" && !editingId) {
        const quoteId = typeof data?.id === "string" ? data.id : null;
        if (!quoteId) {
          setStatus("Presupuesto creado pero no se pudo crear la venta.");
          resetForm();
          await loadQuotes();
          return;
        }

        const confirmRes = await fetch("/api/quotes/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: quoteId }),
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) {
          const errorMessage =
            confirmData?.error ?? "Presupuesto creado pero no se pudo crear la venta.";
          setStatus(`Presupuesto creado pero no se pudo crear la venta: ${errorMessage}`);
          resetForm();
          await loadQuotes();
          return;
        }
        setStatus("Presupuesto guardado y venta creada");
        resetForm();
        await Promise.all([loadQuotes(), loadDeliveryNotes()]);
        return;
      }

      setStatus(editingId ? "Presupuesto actualizado" : "Presupuesto creado");
      resetForm();
      await loadQuotes();
    } catch {
      setStatus("No se pudo guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitQuote("saveQuote");
  };

  const handleSubmitAndCreateSale = async () => {
    await submitQuote("saveAndCreateSale");
  };

  const handleEdit = async (quote: QuoteRow) => {
    setTableStatus(null);
    setBusyId(quote.id);
    try {
      const res = await fetch(`/api/quotes?id=${quote.id}`);
      if (!res.ok) {
        const data = await res.json();
        setTableStatus(data?.error ?? "No se pudo cargar");
        return;
      }
      const detail = (await res.json()) as QuoteDetail;
      const isAnonymousConsumerFinal =
        detail.customer.systemKey === CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON;
      setEditingId(detail.id);
      setCustomerId(detail.customer.id);
      setCustomerSearch(formatCustomerLabel(detail.customer));
      setIsConsumerFinalAnonymous(isAnonymousConsumerFinal);
      setConsumerFinalCustomer(isAnonymousConsumerFinal ? detail.customer : null);
      setValidUntil(detail.validUntil ? detail.validUntil.split("T")[0] : "");
      setQuoteStatus(detail.status);
      setExtraType(detail.extraType ?? "NONE");
      setExtraValue(detail.extraValue ?? "");
      setItems(
        detail.items.map((item) => ({
          productId: item.productId,
          productSearch: formatProductLabel(item.product),
          qty: item.qty,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate ?? "21",
        })),
      );
    } catch {
      setTableStatus("No se pudo cargar");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (quote: QuoteRow) => {
    if (!window.confirm("Eliminar presupuesto?")) return;
    setTableStatus(null);
    setBusyId(quote.id);
    try {
      const res = await fetch(`/api/quotes?id=${quote.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setTableStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setTableStatus("Presupuesto eliminado");
      await loadQuotes();
    } catch {
      setTableStatus("No se pudo eliminar");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmSale = async (quote: QuoteRow) => {
    if (!window.confirm("Confirmar y crear venta?")) return;
    setTableStatus(null);
    setBusyId(quote.id);
    try {
      const res = await fetch("/api/quotes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quote.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        setTableStatus(data?.error ?? "No se pudo confirmar");
        return;
      }

      setTableStatus("Venta creada");
      await Promise.all([loadQuotes(), loadDeliveryNotes()]);
    } catch {
      setTableStatus("No se pudo confirmar");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateDeliveryNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeliveryStatus(null);
    if (!deliveryForm.quoteId) {
      setDeliveryStatus("Selecciona un presupuesto.");
      return;
    }

    setDeliveryBusyId("create");
    try {
      const quoteRes = await fetch(`/api/quotes?id=${deliveryForm.quoteId}`, {
        cache: "no-store",
      });
      const quoteData = await quoteRes.json();
      if (!quoteRes.ok) {
        setDeliveryStatus(quoteData?.error ?? "No se pudo cargar el presupuesto");
        return;
      }
      const detail = quoteData as QuoteDetail;
      if (!detail.items.length) {
        setDeliveryStatus("El presupuesto no tiene items.");
        return;
      }

      const res = await fetch("/api/remitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "R",
          customerId: detail.customer.id,
          saleId: detail.saleId || undefined,
          observations: deliveryForm.observations || undefined,
          digitalRepresentation: true,
          items: detail.items.map((item) => ({
            productId: item.productId,
            description: item.product.name,
            qty: Number(item.qty),
            unit: item.product.unit ?? "unidad",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeliveryStatus(data?.error ?? "No se pudo crear remito");
        return;
      }

      setDeliveryStatus("Remito creado en borrador.");
      setDeliveryQuoteSearch("");
      setDeliveryForm({
        quoteId: "",
        observations: "",
      });
      await loadDeliveryNotes();
    } catch {
      setDeliveryStatus("No se pudo crear remito");
    } finally {
      setDeliveryBusyId(null);
    }
  };

  const handleTransitionDeliveryNote = async (
    noteId: string,
    action: "emit" | "deliver" | "cancel"
  ) => {
    setDeliveryStatus(null);
    setDeliveryBusyId(noteId);
    try {
      const res = await fetch(`/api/remitos/${noteId}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setDeliveryStatus(data?.error ?? "No se pudo actualizar remito");
        return;
      }
      setDeliveryStatus(`Remito actualizado (${data.status}).`);
      await loadDeliveryNotes();
    } catch {
      setDeliveryStatus("No se pudo actualizar remito");
    } finally {
      setDeliveryBusyId(null);
    }
  };

  const handleCustomerFieldChange = (
    field: keyof CustomerFormState,
    value: string,
  ) => {
    setCustomerForm((prev) => ({
      ...prev,
      [field]: field === "taxId" ? normalizeTaxId(value) : value,
    }));
  };

  const handleLookupCustomerByTaxId = async () => {
    const taxId = normalizeTaxId(customerForm.taxId);
    if (!taxId) {
      setCustomerStatus("Ingresa un CUIT para buscar.");
      return;
    }
    setCustomerStatus(null);
    setIsCustomerLookupLoading(true);
    try {
      const res = await fetch("/api/arca/taxpayer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomerStatus(data?.error ?? "No se pudo consultar ARCA");
        return;
      }
      const taxpayer = data?.taxpayer;
      const displayName = taxpayer?.legalName ?? taxpayer?.displayName ?? "";
      setCustomerForm((prev) => ({
        ...prev,
        taxId,
        displayName: prev.displayName || displayName,
      }));
      setCustomerStatus(`Datos ARCA actualizados (${data.source}).`);
    } catch {
      setCustomerStatus("No se pudo consultar ARCA");
    } finally {
      setIsCustomerLookupLoading(false);
    }
  };

  const handleSubmitCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCustomerStatus(null);
    setIsCreatingCustomer(true);
    if (!customerForm.displayName.trim()) {
      setCustomerStatus("Nombre requerido");
      setIsCreatingCustomer(false);
      return;
    }
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: customerForm.displayName,
          type: customerForm.type,
          email: customerForm.email || undefined,
          phone: customerForm.phone || undefined,
          taxId: customerForm.taxId || undefined,
          address: customerForm.address || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCustomerStatus(data?.error ?? "No se pudo crear");
        return;
      }
      setCustomerStatus("Cliente creado");
      setCustomerForm({
        displayName: "",
        type: "CONSUMER_FINAL",
        email: "",
        phone: "",
        taxId: "",
        address: "",
      });
      await loadCustomers();
    } catch {
      setCustomerStatus("No se pudo crear");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const applyQuickRange = (
    range: "month" | "quarter" | "semester" | "year" | "last30",
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Presupuestos
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Armado, envio y confirmacion de presupuestos.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-grid grid-cols-2 rounded-2xl border border-zinc-200/70 bg-white/55 p-1.5">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl border border-sky-200 bg-white shadow-[0_4px_10px_-8px_rgba(14,116,144,0.32)] transition-transform duration-200 ease-out ${
              quoteView === "list" ? "translate-x-full" : ""
            }`}
          />
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
              quoteView === "new" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setQuoteView("new")}
            aria-pressed={quoteView === "new"}
          >
            Nuevo presupuesto
          </button>
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
              quoteView === "list" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setQuoteView("list")}
            aria-pressed={quoteView === "list"}
          >
            Presupuestos
          </button>
        </div>
      </div>

      <QuoteStats
        totalQuotes={totalQuotes}
        sentQuotes={sentQuotes}
        acceptedQuotes={acceptedQuotes}
        totalEstimated={totalEstimated}
      />

      {quoteView === "new" ? (
        <div className="space-y-6">
          <InlineCustomerForm
            form={customerForm}
            status={customerStatus}
            isSubmitting={isCreatingCustomer}
            isLookupLoading={isCustomerLookupLoading}
            show={showCustomerForm}
            onToggle={() => setShowCustomerForm((prev) => !prev)}
            onFormChange={handleCustomerFieldChange}
            onLookupByTaxId={handleLookupCustomerByTaxId}
            onSubmit={handleSubmitCustomer}
          />

          <NewQuoteForm
            customerSearch={customerSearch}
            customerId={customerId}
            isConsumerFinalAnonymous={isConsumerFinalAnonymous}
            isResolvingConsumerFinal={isResolvingConsumerFinal}
            showConsumerFinalThresholdWarning={consumerFinalThresholdReached}
            consumerFinalThresholdLabel={consumerFinalThresholdLabel}
            isCustomerOpen={isCustomerOpen}
            customerMatches={customerMatches}
            customerActiveIndex={customerActiveIndex}
            hasCustomers={customers.length > 0}
            onConsumerFinalToggle={handleConsumerFinalToggle}
            onCustomerSearchChange={handleCustomerSearchChange}
            onCustomerFocus={handleCustomerFocus}
            onCustomerBlur={handleCustomerBlur}
            onCustomerKeyDown={handleCustomerKeyDown}
            onCustomerSelect={handleSelectCustomer}
            validUntil={validUntil}
            onValidUntilChange={setValidUntil}
            extraType={extraType}
            extraValue={extraValue}
            onExtraTypeChange={setExtraType}
            onExtraValueChange={setExtraValue}
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
            taxesTotal={taxesTotal}
            extraAmount={extraAmount}
            total={total}
            isSubmitting={isSubmitting}
            status={status}
            onSubmit={handleSubmit}
            onSubmitAndCreateSale={handleSubmitAndCreateSale}
            showSubmitAndCreateSale={!editingId}
            submitLabel={editingId ? "Guardar cambios" : "Guardar presupuesto"}
          />
        </div>
      ) : null}

      {quoteView === "list" ? (
        <>
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="field-stack">
                <h3 className="section-title">Filtros de presupuestos</h3>
              </div>
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
                  value={quoteQuery}
                  onChange={(event) => setQuoteQuery(event.target.value)}
                  placeholder="Cliente o numero"
                />
              </label>
              <div className="flex h-full items-end justify-end text-right">
                <div className="flex h-[38px] items-center justify-center gap-1.5 rounded-full border border-dashed border-sky-200 px-2">
                  <button
                    type="button"
                    className={`toggle-pill px-2.5 py-1 text-[10px] leading-none ${
                      expiryFilter === "EXPIRED" ? "toggle-pill-active" : ""
                    }`}
                    onClick={() =>
                      setExpiryFilter((prev) =>
                        prev === "EXPIRED" ? "ALL" : "EXPIRED"
                      )
                    }
                    aria-pressed={expiryFilter === "EXPIRED"}
                  >
                    Vencido
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill px-2.5 py-1 text-[10px] leading-none ${
                      expiryFilter === "ACTIVE" ? "toggle-pill-active" : ""
                    }`}
                    onClick={() =>
                      setExpiryFilter((prev) =>
                        prev === "ACTIVE" ? "ALL" : "ACTIVE"
                      )
                    }
                    aria-pressed={expiryFilter === "ACTIVE"}
                  >
                    Vigentes
                  </button>
                </div>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {showAdvancedFilters ? (
                <motion.div
                  key="quote-advanced-filters"
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

          <QuoteRecentTable
            quotes={filteredQuotes}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onConfirmSale={handleConfirmSale}
            isBusyId={busyId}
          />
          <div className="card space-y-4 p-6">
            <div className="rounded-2xl border border-dashed border-sky-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setIsRemitosOpen((prev) => !prev)}
                aria-expanded={isRemitosOpen}
              >
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
                    Remitos
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Gestion simple desde presupuestos, sin pantalla extra.
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold uppercase text-zinc-500 transition-transform ${
                    isRemitosOpen ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isRemitosOpen ? (
                  <motion.div
                    key="remitos-form-panel"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="relative z-30 border-t border-zinc-200/70"
                  >
                    <div className="space-y-3 px-4 py-4">
                <form
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(280px,520px)_minmax(0,1fr)_190px] lg:items-start"
                  onSubmit={handleCreateDeliveryNote}
                >
                  <label className="field-stack sm:col-span-2 lg:col-span-1">
                    <span className="input-label">Presupuesto</span>
                    <div className="relative">
                      <input
                        className="input w-full"
                        value={deliveryQuoteSearch}
                        onChange={(event) =>
                          handleDeliveryQuoteSearchChange(event.target.value)
                        }
                        onFocus={() => {
                          setIsDeliveryQuoteOpen(true);
                          setDeliveryQuoteActiveIndex(0);
                        }}
                        onBlur={() => {
                          window.setTimeout(
                            () => setIsDeliveryQuoteOpen(false),
                            120
                          );
                        }}
                        onKeyDown={handleDeliveryQuoteKeyDown}
                        placeholder="Buscar presupuesto"
                        autoComplete="off"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-haspopup="listbox"
                        aria-expanded={isDeliveryQuoteOpen}
                        aria-controls="delivery-quote-options"
                        aria-activedescendant={
                          isDeliveryQuoteOpen &&
                          deliveryQuoteMatches[deliveryQuoteActiveIndex]
                            ? `delivery-quote-option-${deliveryQuoteMatches[deliveryQuoteActiveIndex].id}`
                            : undefined
                        }
                        required
                      />
                      <AnimatePresence>
                        {isDeliveryQuoteOpen ? (
                          <motion.div
                            key="delivery-quote-options"
                            id="delivery-quote-options"
                            role="listbox"
                            aria-label="Presupuestos"
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{
                              duration: 0.18,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="absolute z-50 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                          >
                            {deliveryQuoteMatches.length ? (
                              deliveryQuoteMatches.map((quote, matchIndex) => {
                                const isSelected = quote.id === deliveryForm.quoteId;
                                const isActive =
                                  matchIndex === deliveryQuoteActiveIndex;
                                return (
                                  <button
                                    key={quote.id}
                                    type="button"
                                    id={`delivery-quote-option-${quote.id}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                      isActive
                                        ? "bg-white text-sky-900"
                                        : isSelected
                                          ? "bg-white text-sky-900"
                                          : "hover:bg-white/70"
                                    }`}
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      handleDeliveryQuoteSelect(quote);
                                    }}
                                  >
                                    <span className="font-medium text-zinc-900">
                                      {quote.quoteNumber ?? quote.id}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                      {quote.customerName}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="px-3 py-2 text-xs text-zinc-500">
                                Sin resultados.
                              </div>
                            )}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </label>
                  <label className="field-stack sm:col-span-2 lg:col-span-1">
                    <span className="input-label">Observaciones (opc.)</span>
                    <textarea
                      className="input !rounded-2xl min-h-[42px] w-full resize-y"
                      value={deliveryForm.observations}
                      onChange={(event) =>
                        setDeliveryForm((prev) => ({
                          ...prev,
                          observations: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="field-stack sm:col-span-2 lg:col-span-1">
                    <span className="input-label select-none opacity-0">
                      Agregar remito
                    </span>
                    <button
                      type="submit"
                      className="btn btn-emerald w-full text-xs"
                      disabled={deliveryBusyId === "create"}
                    >
                      <PlusIcon className="size-4" />
                      {deliveryBusyId === "create" ? "Agregando..." : "Agregar remito"}
                    </button>
                  </div>
                </form>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="table-scroll">
              <table className="w-full text-left text-xs">
                <tbody>
                  {deliveryNotes.length ? (
                    deliveryNotes.map((note) => (
                      <tr
                        key={note.id}
                        className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                      >
                        <td className="py-3 pr-4 text-zinc-900">
                          {note.type} {String(note.pointOfSale).padStart(4, "0")}-
                          {String(note.number ?? 0).padStart(8, "0")}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {note.customerName ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">{note.status}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {note.status === "DRAFT" ? (
                              <button
                                type="button"
                                className="btn btn-emerald text-xs"
                                onClick={() =>
                                  handleTransitionDeliveryNote(note.id, "emit")
                                }
                                disabled={deliveryBusyId === note.id}
                              >
                                Emitir
                              </button>
                            ) : null}
                            {note.status === "ISSUED" ? (
                              <button
                                type="button"
                                className="btn btn-sky text-xs"
                                onClick={() =>
                                  handleTransitionDeliveryNote(note.id, "deliver")
                                }
                                disabled={deliveryBusyId === note.id}
                              >
                                Entregar
                              </button>
                            ) : null}
                            {note.status === "DRAFT" || note.status === "ISSUED" ? (
                              <button
                                type="button"
                                className="btn btn-rose text-xs"
                                onClick={() =>
                                  handleTransitionDeliveryNote(note.id, "cancel")
                                }
                                disabled={deliveryBusyId === note.id}
                              >
                                Cancelar
                              </button>
                            ) : null}
                            <a
                              className="btn text-xs"
                              href={`/api/remitos/${note.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-3 text-sm text-zinc-500" colSpan={4}>
                        Sin remitos por ahora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {deliveryStatus ? (
              <p className="text-xs text-zinc-500">{deliveryStatus}</p>
            ) : null}
          </div>
          {tableStatus ? <p className="text-xs text-zinc-500">{tableStatus}</p> : null}
        </>
      ) : null}
    </div>
  );
}
