"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatCurrencyARS, formatCurrencyUSD } from "@/lib/format";
import { normalizeDecimalInput } from "@/lib/input-format";
import type { PurchaseRow, SupplierOption } from "../types";
import { formatSupplierLabel, normalizeQuery } from "../utils";

type PaymentMethodOption = {
  id: string;
  name: string;
  type: string;
  requiresAccount: boolean;
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

type SupplierPaymentLine = {
  paymentMethodId: string;
  accountId: string;
  currencyCode: string;
  amount: string;
  fxRateUsed: string;
};

type SupplierRetentionLine = {
  type: string;
  baseAmount: string;
  rate: string;
  amount: string;
  note: string;
};

type SupplierPaymentRow = {
  id: string;
  paidAt: string;
  total: string;
  status: string;
  withheldTotal: string;
  cancelledAt: string | null;
  cancellationNote: string | null;
  lines: Array<{
    id: string;
    paymentMethodName: string;
    accountName: string | null;
    currencyCode: string;
    amount: string;
    amountBase: string;
    fxRateUsed: string | null;
  }>;
  allocations: Array<{
    id: string;
    purchaseInvoiceId: string;
    invoiceNumber: string | null;
    amount: string;
  }>;
  retentions: Array<{
    id: string;
    type: string;
    baseAmount: string | null;
    rate: string | null;
    amount: string;
    note: string | null;
  }>;
};

type SupplierPaymentsPanelProps = {
  suppliers: SupplierOption[];
  purchases: PurchaseRow[];
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRate: string | null;
  canCancelPayments: boolean;
  onPaymentCreated: () => void;
};

const buildLine = (
  paymentMethods: PaymentMethodOption[],
  currencies: CurrencyOption[],
  latestUsdRate: string | null,
): SupplierPaymentLine => {
  const defaultMethod = paymentMethods[0]?.id ?? "";
  const defaultCurrency =
    currencies.find((currency) => currency.isDefault)?.code ??
    currencies[0]?.code ??
    "ARS";
  const fxRateUsed =
    defaultCurrency === "ARS" ? "" : latestUsdRate ?? "";
  return {
    paymentMethodId: defaultMethod,
    accountId: "",
    currencyCode: defaultCurrency,
    amount: "",
    fxRateUsed,
  };
};

const RETENTION_OPTIONS = [
  { value: "VAT", label: "IVA" },
  { value: "INCOME", label: "Ganancias" },
  { value: "IIBB", label: "IIBB" },
  { value: "OTHER", label: "Otra" },
];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Anulado",
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  CONFIRMED:
    "bg-white text-emerald-800 border border-emerald-200",
  CANCELLED:
    "bg-white text-rose-800 border border-rose-200",
};

const formatAmountByCurrency = (amount: string | number, currencyCode: string) => {
  if (currencyCode === "ARS") return formatCurrencyARS(amount);
  if (currencyCode === "USD") return formatCurrencyUSD(amount);
  const parsed = Number(amount ?? 0);
  return `${parsed.toFixed(2)} ${currencyCode}`;
};

export function SupplierPaymentsPanel({
  suppliers,
  purchases,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  canCancelPayments,
  onPaymentCreated,
}: SupplierPaymentsPanelProps) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [supplierActiveIndex, setSupplierActiveIndex] = useState(0);
  const [paidAt, setPaidAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<SupplierPaymentLine[]>(() => [
    buildLine(paymentMethods, currencies, latestUsdRate),
  ]);
  const [retentions, setRetentions] = useState<SupplierRetentionLine[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const methodsById = useMemo(
    () => new Map(paymentMethods.map((method) => [method.id, method])),
    [paymentMethods],
  );

  const supplierMatches = useMemo(() => {
    const query = normalizeQuery(supplierSearch);
    const list = query
      ? suppliers.filter((supplier) =>
          `${supplier.displayName} ${supplier.taxId ?? ""}`
            .toLowerCase()
            .includes(query),
        )
      : suppliers;
    return list.slice(0, 8);
  }, [supplierSearch, suppliers]);

  const openPurchases = useMemo(() => {
    if (!supplierId) return [];
    return purchases.filter((purchase) => {
      if (purchase.supplierId !== supplierId) return false;
      if (purchase.status === "CANCELLED") return false;
      if (purchase.impactsAccount === false) return false;
      const total = Number(purchase.total ?? 0);
      const paid = Number(purchase.paidTotal ?? 0);
      const storedBalance = Number(purchase.balance ?? 0);
      const balance =
        storedBalance > 0 ? storedBalance : Math.max(total - paid, 0);
      return balance > 0.005;
    });
  }, [purchases, supplierId]);

  const loadPayments = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/supplier-payments?supplierId=${encodeURIComponent(id)}`,
      );
      if (!res.ok) {
        setStatus("No se pudieron cargar pagos");
        return;
      }
      const data = (await res.json()) as SupplierPaymentRow[];
      setPayments(data);
    } catch {
      setStatus("No se pudieron cargar pagos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supplierId) {
      setPayments([]);
      setAllocations({});
      setRetentions([]);
      return;
    }
    const selected = suppliers.find((supplier) => supplier.id === supplierId);
    if (selected) {
      setSupplierSearch(formatSupplierLabel(selected));
    }
    loadPayments(supplierId).catch(() => undefined);
    setAllocations({});
    setRetentions([]);
  }, [supplierId, suppliers, loadPayments]);

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

  const addLine = () => {
    setLines((prev) => [...prev, buildLine(paymentMethods, currencies, latestUsdRate)]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const addRetention = () => {
    setRetentions((prev) => [
      ...prev,
      { type: "VAT", baseAmount: "", rate: "", amount: "", note: "" },
    ]);
  };

  const removeRetention = (index: number) => {
    setRetentions((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateRetention = (
    index: number,
    updates: Partial<SupplierRetentionLine>,
  ) => {
    setRetentions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const updateLine = (index: number, updates: Partial<SupplierPaymentLine>) => {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      const updated = { ...current, ...updates };
      const method = methodsById.get(updated.paymentMethodId);
      if (updates.paymentMethodId && method && !method.requiresAccount) {
        updated.accountId = "";
      }
      if (updates.currencyCode && updates.currencyCode === "ARS") {
        updated.fxRateUsed = "";
      }
      if (updates.currencyCode && updates.currencyCode !== "ARS") {
        updated.fxRateUsed = updated.fxRateUsed || latestUsdRate || "";
      }
      next[index] = updated;
      return next;
    });
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const amount = Number(line.amount || 0);
        const fx = Number(line.fxRateUsed || 0);
        const base =
          line.currencyCode === "ARS" || !line.currencyCode
            ? amount
            : amount * fx;
        return {
          base: acc.base + (Number.isFinite(base) ? base : 0),
        };
      },
      { base: 0 },
    );
  }, [lines]);

  const allocationsTotal = useMemo(() => {
    return Object.values(allocations).reduce(
      (sum, value) => sum + Number(value || 0),
      0,
    );
  }, [allocations]);

  const retentionsTotal = useMemo(() => {
    return retentions.reduce(
      (sum, retention) => sum + Number(retention.amount || 0),
      0,
    );
  }, [retentions]);

  const totalImpact = totals.base + retentionsTotal;
  const remaining = totalImpact - allocationsTotal;

  const handleAllocationChange = (purchaseId: string, value: string) => {
    setAllocations((prev) => ({
      ...prev,
      [purchaseId]: normalizeDecimalInput(value, 2),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      return;
    }
    if (!lines.length) {
      setStatus("Agrega al menos una linea de pago");
      return;
    }
    if (remaining < -0.01) {
      setStatus("El total asignado supera el pago");
      return;
    }

    const normalizedLines = lines.map((line) => ({
      paymentMethodId: line.paymentMethodId,
      accountId: line.accountId || undefined,
      currencyCode: line.currencyCode || "ARS",
      amount: Number(line.amount || 0),
      fxRateUsed: line.fxRateUsed ? Number(line.fxRateUsed) : undefined,
    }));

    const normalizedRetentions = retentions
      .filter((retention) => Number(retention.amount || 0) > 0)
      .map((retention) => ({
        type: retention.type,
        amount: Number(retention.amount || 0),
        baseAmount: retention.baseAmount
          ? Number(retention.baseAmount)
          : undefined,
        rate: retention.rate ? Number(retention.rate) : undefined,
        note: retention.note || undefined,
      }));

    const allocationList = openPurchases
      .map((purchase) => {
        const total = Number(purchase.total ?? 0);
        const paid = Number(purchase.paidTotal ?? 0);
        const storedBalance = Number(purchase.balance ?? 0);
        const balance =
          storedBalance > 0 ? storedBalance : Math.max(total - paid, 0);
        return {
          purchaseInvoiceId: purchase.id,
          amount: Number(allocations[purchase.id] || 0),
          balance,
        };
      })
      .filter((allocation) => allocation.amount > 0);

    const hasInvalid = normalizedLines.some((line) => {
      if (!line.paymentMethodId) return true;
      if (!line.amount || line.amount <= 0) return true;
      if (line.currencyCode !== "ARS" && !line.fxRateUsed) return true;
      return false;
    });

    if (hasInvalid) {
      setStatus("Revisa los importes y la cotizacion");
      return;
    }

    const hasInvalidRetention = retentions.some((retention) => {
      const amount = Number(retention.amount || 0);
      return !retention.type || amount < 0;
    });

    if (hasInvalidRetention) {
      setStatus("Revisa las retenciones");
      return;
    }

    const invalidAllocation = allocationList.find(
      (allocation) => allocation.amount > allocation.balance + 0.005,
    );
    if (invalidAllocation) {
      setStatus("Hay compras con monto asignado mayor al saldo");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          paidAt,
          lines: normalizedLines,
          allocations: allocationList.map((allocation) => ({
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            amount: allocation.amount,
          })),
          retentions: normalizedRetentions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo registrar");
        return;
      }
      setLines([buildLine(paymentMethods, currencies, latestUsdRate)]);
      setAllocations({});
      setRetentions([]);
      setStatus("Pago registrado");
      await loadPayments(supplierId);
      onPaymentCreated();
    } catch {
      setStatus("No se pudo registrar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!window.confirm("Anular este pago?")) return;
    const note = window.prompt("Motivo de anulación (opcional)") ?? undefined;
    setCancellingId(paymentId);
    setStatus(null);
    try {
      const res = await fetch("/api/supplier-payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo anular");
        return;
      }
      setStatus("Pago anulado");
      if (supplierId) {
        await loadPayments(supplierId);
      }
      onPaymentCreated();
    } catch {
      setStatus("No se pudo anular");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="card space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Pagos a proveedores
          </h3>
          <p className="text-xs text-zinc-500">
            Asigna pagos a compras y al saldo general.
          </p>
        </div>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => supplierId && loadPayments(supplierId)}
          disabled={!supplierId || isLoading}
        >
          {isLoading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <label className="flex flex-col gap-2 text-xs text-zinc-500">
        Proveedor
        <div className="relative">
          <input
            className="input text-xs"
            value={supplierSearch}
            onChange={(event) => handleSupplierSearchChange(event.target.value)}
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
            aria-controls="supplier-payments-options"
            aria-activedescendant={
              isSupplierOpen && supplierMatches[supplierActiveIndex]
                ? `supplier-payments-option-${supplierMatches[supplierActiveIndex].id}`
                : undefined
            }
          />
          <AnimatePresence>
            {isSupplierOpen ? (
              <motion.div
                key="supplier-payments-options"
                id="supplier-payments-options"
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
                          id={`supplier-payments-option-${supplier.id}`}
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

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}

      {!paymentMethods.length ? (
        <p className="text-xs text-zinc-500">
          No hay metodos de pago activos.
        </p>
      ) : !currencies.length ? (
        <p className="text-xs text-zinc-500">
          No hay monedas activas configuradas.
        </p>
      ) : !supplierId ? (
        <p className="text-xs text-zinc-500">
          Selecciona un proveedor para cargar pagos.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-2 text-[11px] text-zinc-500">
              Fecha de pago
              <input
                type="date"
                className="input text-xs"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const method = methodsById.get(line.paymentMethodId);
              const requiresAccount = Boolean(method?.requiresAccount);
              const currencyAccounts = accounts.filter(
                (account) => account.currencyCode === line.currencyCode,
              );
              return (
                <div
                  key={`${line.paymentMethodId}-${index}`}
                  className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
                >
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-44">
                    Metodo
                    <select
                      className="input text-xs"
                      value={line.paymentMethodId}
                      onChange={(event) =>
                        updateLine(index, { paymentMethodId: event.target.value })
                      }
                    >
                      {paymentMethods.map((methodOption) => (
                        <option key={methodOption.id} value={methodOption.id}>
                          {methodOption.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {requiresAccount ? (
                    <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-44">
                      Cuenta
                      <select
                        className="input text-xs"
                        value={line.accountId}
                        onChange={(event) =>
                          updateLine(index, { accountId: event.target.value })
                        }
                      >
                        <option value="">Selecciona cuenta</option>
                        {currencyAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Moneda
                    <select
                      className="input text-xs"
                      value={line.currencyCode}
                      onChange={(event) =>
                        updateLine(index, { currencyCode: event.target.value })
                      }
                    >
                      {currencies.map((currency) => (
                        <option key={currency.id} value={currency.code}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Importe
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(event) =>
                        updateLine(index, {
                          amount: normalizeDecimalInput(event.target.value, 2),
                        })
                      }
                      required
                    />
                  </label>
                  {line.currencyCode !== "ARS" ? (
                    <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-28">
                      Cotizacion
                      <input
                        className="input text-xs"
                        inputMode="decimal"
                        value={line.fxRateUsed}
                        onChange={(event) =>
                          updateLine(index, {
                            fxRateUsed: normalizeDecimalInput(event.target.value, 6),
                          })
                        }
                        required
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-rose text-xs"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 1}
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="btn text-xs" onClick={addLine}>
            Agregar linea
          </button>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Retenciones
            </p>
            {retentions.length ? (
              retentions.map((retention, index) => (
                <div
                  key={`${retention.type}-${index}`}
                  className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
                >
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-36">
                    Tipo
                    <select
                      className="input text-xs"
                      value={retention.type}
                      onChange={(event) =>
                        updateRetention(index, { type: event.target.value })
                      }
                    >
                      {RETENTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Base
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      value={retention.baseAmount}
                      onChange={(event) =>
                        updateRetention(index, {
                          baseAmount: normalizeDecimalInput(event.target.value, 2),
                        })
                      }
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-20">
                    % 
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      value={retention.rate}
                      onChange={(event) =>
                        updateRetention(index, {
                          rate: normalizeDecimalInput(event.target.value, 2),
                        })
                      }
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Importe
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      value={retention.amount}
                      onChange={(event) =>
                        updateRetention(index, {
                          amount: normalizeDecimalInput(event.target.value, 2),
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-2 text-[11px] text-zinc-500">
                    Nota
                    <input
                      className="input text-xs"
                      value={retention.note}
                      onChange={(event) =>
                        updateRetention(index, { note: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-rose text-xs"
                    onClick={() => removeRetention(index)}
                  >
                    Quitar
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500">Sin retenciones.</p>
            )}
            <button type="button" className="btn text-xs" onClick={addRetention}>
              Agregar retencion
            </button>
          </div>

          <div className="rounded-2xl border border-dashed border-zinc-200/70 bg-white/40 p-3 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-700">
              Total pago: {formatCurrencyARS(totals.base)}
            </p>
            <p>Retenciones: {formatCurrencyARS(retentionsTotal)}</p>
            <p>Total impacto: {formatCurrencyARS(totalImpact)}</p>
            <p>Asignado a compras: {formatCurrencyARS(allocationsTotal)}</p>
            <p>Sin asignar: {formatCurrencyARS(remaining)}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Asignar a compras abiertas
            </p>
            {openPurchases.length ? (
              <div className="space-y-2">
                {openPurchases.map((purchase) => {
                  const total = Number(purchase.total ?? 0);
                  const paid = Number(purchase.paidTotal ?? 0);
                  const storedBalance = Number(purchase.balance ?? 0);
                  const balance =
                    storedBalance > 0 ? storedBalance : Math.max(total - paid, 0);
                  return (
                    <div
                      key={purchase.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-3 text-xs text-zinc-600"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-zinc-900">
                          {purchase.invoiceNumber ?? purchase.id}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Saldo {formatCurrencyARS(balance)}
                        </p>
                      </div>
                      <label className="flex flex-col gap-2 text-[11px] text-zinc-500">
                        Monto
                        <input
                          className="input text-xs"
                          inputMode="decimal"
                          value={allocations[purchase.id] ?? ""}
                          onChange={(event) =>
                            handleAllocationChange(
                              purchase.id,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                No hay compras abiertas para este proveedor.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-sky text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registrando..." : "Registrar pago"}
          </button>
        </form>
      )}

      {payments.length ? (
        <div className="space-y-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Ultimos pagos
          </p>
          <div className="space-y-2 text-xs text-zinc-600">
            {payments.slice(0, 6).map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
              >
                <div>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(payment.paidAt).toLocaleDateString("es-AR")}
                  </p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                      PAYMENT_STATUS_STYLES[payment.status] ??
                      "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                    }`}
                  >
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </span>
                  <p className="font-semibold text-zinc-900">
                    {formatCurrencyARS(payment.total)}
                  </p>
                  {Number(payment.withheldTotal || 0) > 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      Retenciones {formatCurrencyARS(payment.withheldTotal)}
                    </p>
                  ) : null}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {payment.lines
                    .map(
                      (line) =>
                        `${line.paymentMethodName} ${formatAmountByCurrency(
                          line.amount,
                          line.currencyCode,
                        )}`,
                    )
                    .join(" · ")}
                  {payment.retentions?.length
                    ? ` · Retenciones ${payment.retentions
                        .map((retention) => formatCurrencyARS(retention.amount))
                        .join(" / ")}`
                    : ""}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="btn text-xs"
                    href={`/api/pdf/supplier-payment?id=${payment.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>
                  {payment.status !== "CANCELLED" && canCancelPayments ? (
                    <button
                      type="button"
                      className="btn btn-rose text-xs"
                      disabled={cancellingId === payment.id}
                      onClick={() => handleCancelPayment(payment.id)}
                    >
                      {cancellingId === payment.id ? "Anulando..." : "Anular"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {!canCancelPayments ? (
            <p className="text-[11px] text-zinc-500">
              Solo OWNER/ADMIN pueden anular pagos.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
