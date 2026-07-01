import { useEffect, useMemo, useState } from "react";
import { TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import {
  getPurchaseOpenBalance,
  getSignedPurchaseAllocationAmount,
  isPurchaseCreditNote,
} from "@/lib/purchases";
import { PURCHASE_DOCUMENT_TYPE_LABELS } from "@/lib/purchases/fiscal";
import type { PurchaseRow } from "../types";
import { PurchaseSelect } from "./PurchaseSelect";

type PaymentMethodOption = {
  id: string;
  name: string;
  requiresAccount: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  currencyCode: string;
};

type CashOutLineForm = {
  paymentMethodId: string;
  accountId: string;
  amount: string;
};

type SupplierGroupedPaymentModalProps = {
  purchase: PurchaseRow | null;
  purchases: PurchaseRow[];
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toMoneyValue = (value: number) => roundMoney(value).toFixed(2);

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toCalendarDateInput = (value: string | null | undefined) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const localMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateInputValue(parsed);
};

const paymentMethodRequiresAccount = (
  paymentMethodId: string,
  paymentMethods: PaymentMethodOption[],
) => {
  const method = paymentMethods.find(
    (candidate) => candidate.id === paymentMethodId,
  );
  return Boolean(method?.requiresAccount);
};

const resolveDefaultCashOutAccountId = (
  paymentMethodId: string,
  paymentMethods: PaymentMethodOption[],
  accounts: AccountOption[],
) => {
  const method = paymentMethods.find(
    (candidate) => candidate.id === paymentMethodId,
  );
  if (!method?.requiresAccount) return "";
  return accounts.find((account) => account.currencyCode === "ARS")?.id ?? "";
};

const buildCashOutLine = (
  paymentMethods: PaymentMethodOption[],
  accounts: AccountOption[],
): CashOutLineForm => {
  const methodId = paymentMethods[0]?.id ?? "";
  return {
    paymentMethodId: methodId,
    accountId: resolveDefaultCashOutAccountId(methodId, paymentMethods, accounts),
    amount: "",
  };
};

export default function SupplierGroupedPaymentModal({
  purchase,
  purchases,
  paymentMethods,
  accounts,
  onClose,
  onSuccess,
}: SupplierGroupedPaymentModalProps) {
  const [paidAt, setPaidAt] = useState(() => toDateInputValue(new Date()));
  const [lines, setLines] = useState<CashOutLineForm[]>(() =>
    paymentMethods.length ? [buildCashOutLine(paymentMethods, accounts)] : [],
  );
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [paymentTotalEdited, setPaymentTotalEdited] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const arsAccounts = useMemo(
    () => accounts.filter((account) => account.currencyCode === "ARS"),
    [accounts],
  );

  const openPurchases = useMemo(() => {
    if (!purchase) return [];
    return purchases.filter((candidate) => {
      if (candidate.supplierId !== purchase.supplierId) return false;
      if (candidate.status === "CANCELLED") return false;
      if (candidate.impactsAccount === false) return false;
      return getPurchaseOpenBalance(candidate) > 0.005;
    });
  }, [purchase, purchases]);

  const lineTotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    [lines],
  );

  const allocationTotal = useMemo(
    () =>
      openPurchases.reduce(
        (sum, candidate) =>
          sum +
          getSignedPurchaseAllocationAmount(
            candidate.documentType,
            allocations[candidate.id] ?? 0,
          ),
        0,
      ),
    [allocations, openPurchases],
  );

  const remaining = lineTotal - allocationTotal;
  const canSubmitPayment =
    !isSubmitting &&
    lineTotal > 0.005 &&
    allocationTotal > 0 &&
    Math.abs(remaining) <= 0.01;

  useEffect(() => {
    if (lines.length !== 1) return;
    if (paymentTotalEdited) return;
    const syncedAmount = allocationTotal > 0.005 ? toMoneyValue(allocationTotal) : "";
    setLines((prev) => {
      if (prev.length !== 1) return prev;
      if (prev[0]?.amount === syncedAmount) return prev;
      return [{ ...prev[0], amount: syncedAmount }];
    });
  }, [allocationTotal, lines.length, paymentTotalEdited]);

  useEffect(() => {
    if (!purchase) return;

    const purchaseDate =
      toCalendarDateInput(purchase.invoiceDate) ||
      toCalendarDateInput(purchase.createdAt) ||
      toDateInputValue(new Date());
    setPaidAt(purchaseDate);
    setStatus(null);
    setLines(
      paymentMethods.length ? [buildCashOutLine(paymentMethods, accounts)] : [],
    );
    setPaymentTotalEdited(false);

    const currentBalance = getPurchaseOpenBalance(purchase);
    setAllocations(
      currentBalance > 0.005
        ? { [purchase.id]: toMoneyValue(currentBalance) }
        : {},
    );
  }, [purchase, paymentMethods, accounts]);

  if (!purchase) return null;

  const isAllocationSelected = (purchaseId: string) =>
    purchaseId in allocations;

  const syncPaymentTotalToAllocation = () => {
    if (lines.length !== 1) return;
    const syncedAmount = allocationTotal > 0.005 ? toMoneyValue(allocationTotal) : "";
    setPaymentTotalEdited(false);
    setLines((prev) => {
      if (prev.length !== 1) return prev;
      return [{ ...prev[0], amount: syncedAmount }];
    });
  };

  const addLine = () => {
    setPaymentTotalEdited(true);
    setLines((prev) => [...prev, buildCashOutLine(paymentMethods, accounts)]);
  };

  const removeLine = (index: number) => {
    setPaymentTotalEdited(true);
    setLines((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateLine = (index: number, updates: Partial<CashOutLineForm>) => {
    if (updates.amount !== undefined) {
      setPaymentTotalEdited(true);
    }
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: CashOutLineForm = { ...current, ...updates };
      if (updates.paymentMethodId !== undefined) {
        updated.accountId = resolveDefaultCashOutAccountId(
          updates.paymentMethodId,
          paymentMethods,
          accounts,
        );
      }
      next[index] = updated;
      return next;
    });
  };

  const handleAllocationToggle = (candidate: PurchaseRow, checked: boolean) => {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!checked) {
        delete next[candidate.id];
        return next;
      }
      const currentAmount = Number(next[candidate.id] || 0);
      next[candidate.id] =
        currentAmount > 0
          ? next[candidate.id]
          : toMoneyValue(getPurchaseOpenBalance(candidate));
      return next;
    });
  };

  const handleAllocationChange = (purchaseId: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [purchaseId]: value }));
  };

  const handleSubmit = async () => {
    setStatus(null);

    if (!paymentMethods.length) {
      setStatus("No hay metodos de pago activos");
      return;
    }

    if (!purchase.supplierId) {
      setStatus("Proveedor invalido");
      return;
    }

    if (!lines.length) {
      setStatus("Agrega al menos una linea de pago");
      return;
    }

    if (!paidAt) {
      setStatus("Ingresa la fecha del pago");
      return;
    }

    const requiresAccountWithoutArs = lines.some((line) => {
      const requiresAccount = paymentMethodRequiresAccount(
        line.paymentMethodId,
        paymentMethods,
      );
      return requiresAccount && !arsAccounts.length;
    });
    if (requiresAccountWithoutArs) {
      setStatus(
        "No hay cuentas ARS disponibles para metodos que requieren cuenta",
      );
      return;
    }

    const normalizedLines = lines.map((line) => ({
      paymentMethodId: line.paymentMethodId,
      accountId: line.accountId || undefined,
      currencyCode: "ARS",
      amount: Number(line.amount || 0),
    }));

    if (lineTotal <= 0.005) {
      setStatus("Carga el monto en las lineas de pago antes de imputar compras");
      return;
    }

    const hasInvalidLine = normalizedLines.some((line) => {
      if (!line.paymentMethodId) return true;
      if (!line.amount || line.amount <= 0) return true;
      if (
        paymentMethodRequiresAccount(line.paymentMethodId, paymentMethods) &&
        !line.accountId
      ) {
        return true;
      }
      return false;
    });

    if (hasInvalidLine) {
      setStatus("Revisa metodos, cuentas e importes");
      return;
    }

    const selectedOpenPurchases = openPurchases.filter((candidate) =>
      isAllocationSelected(candidate.id),
    );
    const invalidSelectedAmount = selectedOpenPurchases.some(
      (candidate) => Number(allocations[candidate.id] || 0) <= 0,
    );

    if (invalidSelectedAmount) {
      setStatus("Revisa los montos seleccionados");
      return;
    }

    const allocationList = selectedOpenPurchases
      .map((candidate) => ({
        purchaseInvoiceId: candidate.id,
        amount: Number(allocations[candidate.id] || 0),
        balance: getPurchaseOpenBalance(candidate),
      }))

    if (!allocationList.length) {
      setStatus("Selecciona al menos una compra o nota a imputar");
      return;
    }

    if (allocationTotal <= 0.005) {
      setStatus("Las notas de credito deben compensarse con facturas.");
      return;
    }

    const invalidAllocation = allocationList.find(
      (allocation) => allocation.amount > allocation.balance + 0.005,
    );

    if (invalidAllocation) {
      setStatus("Hay compras con monto asignado mayor al saldo");
      return;
    }

    if (Math.abs(remaining) > 0.01) {
      setStatus("El monto de pago y el neto imputado deben coincidir");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: purchase.supplierId,
          paidAt,
          lines: normalizedLines,
          allocations: allocationList.map((allocation) => ({
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            amount: allocation.amount,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setStatus(data?.error ?? "No se pudo registrar el pago");
        return;
      }

      await onSuccess();
      onClose();
    } catch {
      setStatus("No se pudo registrar el pago");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[121] bg-zinc-950/25 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-grouped-payment-title"
        className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)] sm:h-[calc(100dvh-2rem)]"
      >
        <div className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-4">
          <h2
            id="supplier-grouped-payment-title"
            className="text-lg font-semibold text-zinc-900"
          >
            Pagar compras del proveedor
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {purchase.supplierName} · desde{" "}
            {purchase.invoiceNumber ?? "Sin comprobante fiscal"}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="field-stack min-w-0">
                <span className="input-label">Fecha</span>
                <input
                  type="date"
                  className="input w-full min-w-0 cursor-pointer"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </label>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const requiresAccount = paymentMethodRequiresAccount(
                  line.paymentMethodId,
                  paymentMethods,
                );
                return (
                  <div
                    key={`supplier-cash-out-line-${index}`}
                    className="grid gap-3 rounded-xl border border-zinc-200/70 bg-white/40 p-3 sm:grid-cols-[minmax(180px,1.4fr)_minmax(180px,1.4fr)_minmax(130px,1fr)_auto] sm:items-end"
                  >
                    <label className="field-stack min-w-0">
                      <span className="input-label">Metodo de pago</span>
                      <PurchaseSelect
                        value={line.paymentMethodId}
                        options={[
                          {
                            value: "",
                            label: paymentMethods.length
                              ? "Selecciona metodo"
                              : "Sin metodos activos",
                          },
                          ...paymentMethods.map((method) => ({
                            value: method.id,
                            label: method.name,
                          })),
                        ]}
                        onValueChange={(value) =>
                          updateLine(index, {
                            paymentMethodId: value,
                          })
                        }
                        disabled={!paymentMethods.length}
                      />
                    </label>
                    <label className="field-stack min-w-0">
                      <span className="input-label">Cuenta de egreso</span>
                      {requiresAccount ? (
                        <PurchaseSelect
                          value={line.accountId}
                          options={[
                            { value: "", label: "Selecciona cuenta" },
                            ...arsAccounts.map((account) => ({
                              value: account.id,
                              label: `${account.name} (${account.currencyCode})`,
                            })),
                          ]}
                          onValueChange={(value) =>
                            updateLine(index, { accountId: value })
                          }
                        />
                      ) : (
                        <input
                          className="input w-full min-w-0"
                          value="No requiere cuenta"
                          readOnly
                          disabled
                        />
                      )}
                    </label>
                    <label className="field-stack min-w-0">
                      <span className="input-label">Monto</span>
                      <MoneyInput
                        className="input w-full min-w-0 text-right tabular-nums"
                        value={line.amount}
                        onValueChange={(nextValue) =>
                          updateLine(index, { amount: nextValue })
                        }
                        placeholder="0,00"
                        maxDecimals={2}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-rose h-10 w-10 justify-center p-0 sm:self-end"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 1}
                      aria-label="Quitar linea de pago"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn w-full text-xs sm:w-auto"
                onClick={addLine}
              >
                Agregar linea
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Imputar facturas y notas abiertas
              </p>
              <div className="space-y-2">
                {openPurchases.length ? (
                  openPurchases.map((candidate) => {
                    const balance = getPurchaseOpenBalance(candidate);
                    const isCredit = isPurchaseCreditNote(candidate.documentType);
                    const isSelected = isAllocationSelected(candidate.id);
                    return (
                      <div
                        key={candidate.id}
                        className="grid gap-3 rounded-xl border border-zinc-200/70 bg-white/40 p-3 text-xs text-zinc-600 sm:grid-cols-[128px_minmax(0,1fr)_170px] sm:items-center"
                      >
                        <div className="inline-flex items-center gap-2 text-xs text-zinc-700">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isSelected}
                            aria-label={`Seleccionar ${
                              candidate.invoiceNumber ?? "compra"
                            }`}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                              isSelected
                                ? "border-sky-300 bg-sky-100"
                                : "border-zinc-300 bg-zinc-100"
                            }`}
                            onClick={() =>
                              handleAllocationToggle(candidate, !isSelected)
                            }
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
                                isSelected ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                          <span className="font-semibold">
                            {isSelected ? "Seleccionada" : "Seleccionar"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900">
                            {candidate.invoiceNumber ?? "Sin comprobante fiscal"}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {
                              PURCHASE_DOCUMENT_TYPE_LABELS[
                                candidate.documentType ?? "INVOICE"
                              ]
                            }{" "}
                            · {isCredit ? "Credito disponible" : "Saldo"}{" "}
                            {formatCurrencyARS(balance)}
                          </p>
                        </div>
                        {isSelected ? (
                          <label className="field-stack min-w-0">
                            <span className="input-label">Monto</span>
                            <MoneyInput
                              className="input w-full min-w-0 text-right tabular-nums"
                              value={allocations[candidate.id] ?? ""}
                              onValueChange={(nextValue) =>
                                handleAllocationChange(candidate.id, nextValue)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </label>
                        ) : (
                          <div className="hidden sm:block" />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p>No hay compras abiertas para este proveedor.</p>
                    <p>El proveedor ya no tiene saldo pendiente para imputar.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  Total lineas:{" "}
                  <span className="font-semibold text-zinc-900">
                    {formatCurrencyARS(lineTotal)}
                  </span>
                </p>
                {lines.length === 1 &&
                allocationTotal > 0.005 &&
                Math.abs(remaining) > 0.01 ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-sky-700 hover:text-sky-900"
                    onClick={syncPaymentTotalToAllocation}
                  >
                    Igualar al neto
                  </button>
                ) : null}
              </div>
              <p>
                Neto imputado:{" "}
                <span className="font-semibold text-zinc-900">
                  {formatCurrencyARS(allocationTotal)}
                </span>
              </p>
              <p>
                Diferencia:{" "}
                <span
                  className={`font-semibold ${
                    Math.abs(remaining) <= 0.01
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatCurrencyARS(remaining)}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                El pago se registra recien al presionar &quot;Registrar pago&quot;.
              </p>
              {lineTotal <= 0.005 ? (
                <p className="mt-1 text-[11px] text-rose-600">
                  Falta cargar el monto de pago.
                </p>
              ) : null}
              {allocationTotal <= 0 ? (
                <p className="mt-1 text-[11px] text-rose-600">
                  Falta imputar facturas por encima de las notas de credito.
                </p>
              ) : null}
              {lineTotal > 0.005 && allocationTotal > 0 && Math.abs(remaining) > 0.01 ? (
                <p className="mt-1 text-[11px] text-rose-600">
                  El monto de pago y el neto imputado deben coincidir.
                </p>
              ) : null}
            </div>

            {status ? <p className="text-xs text-zinc-600">{status}</p> : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200/70 px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn w-full sm:w-auto"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-emerald w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={!canSubmitPayment}
            >
              {isSubmitting ? "Registrando..." : "Registrar pago"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
